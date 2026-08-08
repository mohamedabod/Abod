package com.sayemfit.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.Log;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Native BLE client for the smart band.
 *
 * Why native and not Web Bluetooth: android.webkit.WebView does not implement
 * navigator.bluetooth at all, so the Web Bluetooth code in the v3 spec could
 * never have worked inside this app. Everything BLE lives here instead and is
 * pushed into JS through JsBridge.
 *
 * Huawei Band 11 Pro: the band speaks a proprietary, encrypted protocol to the
 * Huawei Health app, but it also implements the *standard* GATT Heart Rate
 * Service once "HR Data Broadcasts" is switched on in the band settings
 * (Huawei Health > device > Settings > HR Data Broadcasts). That is the mode
 * this client targets, and it is the only way to get live HR without HMS.
 */
public class BleManager {

    private static final String TAG = "SayemBle";

    public static final UUID SRV_HR = UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb");
    public static final UUID CHR_HR = UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb");
    public static final UUID SRV_BATTERY = UUID.fromString("0000180f-0000-1000-8000-00805f9b34fb");
    public static final UUID CHR_BATTERY = UUID.fromString("00002a19-0000-1000-8000-00805f9b34fb");
    public static final UUID DSC_CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private static final long SCAN_TIMEOUT_MS = 25000L;
    private static final long RECONNECT_DELAY_MS = 12000L;
    private static final int MAX_RECONNECTS = 20;

    private final Context ctx;
    private final AppCore core;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final BleScanCallbackImpl scanCb;
    private final GattCallbackImpl gattCb;

    private BluetoothAdapter adapter;
    private BluetoothLeScanner scanner;
    private BluetoothGatt gatt;

    private boolean scanning;
    private boolean wantConnection;
    private int reconnectAttempts;

    private String status = "idle";
    private String deviceName = "";
    private String deviceAddress = "";
    private int heartRate;
    private int battery = -1;
    private long lastBeatAt;

    private final Runnable scanTimeout = new ScanTimeoutTask(this);
    private final Runnable reconnectTask = new ReconnectTask(this);

    public BleManager(Context c, AppCore core) {
        this.ctx = c.getApplicationContext();
        this.core = core;
        this.scanCb = new BleScanCallbackImpl(this);
        this.gattCb = new GattCallbackImpl(this);
    }

    // ------------------------------------------------------------------
    // Public API (called from JsBridge / FastingService)
    // ------------------------------------------------------------------

    /** @return "ok", or an error code JS turns into a localized message. */
    public String startScan() {
        if (!ensureAdapter()) return "no_adapter";
        if (!adapter.isEnabled()) return "bt_off";
        if (!hasScanPermission()) return "no_permission";

        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) return "no_adapter";
        if (scanning) return "ok";

        List<ScanFilter> filters = new ArrayList<ScanFilter>();
        ScanFilter.Builder fb = new ScanFilter.Builder();
        fb.setServiceUuid(new ParcelUuid(SRV_HR));
        filters.add(fb.build());

        ScanSettings.Builder sb = new ScanSettings.Builder();
        sb.setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY);
        if (Build.VERSION.SDK_INT >= 23) {
            sb.setMatchMode(ScanSettings.MATCH_MODE_AGGRESSIVE);
            sb.setNumOfMatches(ScanSettings.MATCH_NUM_ONE_ADVERTISEMENT);
        }

        try {
            scanner.startScan(filters, sb.build(), scanCb);
        } catch (SecurityException e) {
            return "no_permission";
        } catch (IllegalStateException e) {
            return "bt_off";
        }
        scanning = true;
        wantConnection = true;
        reconnectAttempts = 0;
        setStatus("scanning");
        ui.removeCallbacks(scanTimeout);
        ui.postDelayed(scanTimeout, SCAN_TIMEOUT_MS);
        return "ok";
    }

    public void stopScan() {
        ui.removeCallbacks(scanTimeout);
        if (!scanning) return;
        scanning = false;
        try {
            if (scanner != null) scanner.stopScan(scanCb);
        } catch (SecurityException e) {
            Log.w(TAG, "stopScan denied");
        } catch (IllegalStateException e) {
            Log.w(TAG, "stopScan while BT off");
        }
    }

    /** Reconnects to the last paired band without a fresh scan. */
    public String connectSaved() {
        String addr = core.prefs().getString(AppCore.K_BAND_ADDR, "");
        if (addr == null || addr.length() == 0) return "no_saved_device";
        if (!ensureAdapter()) return "no_adapter";
        if (!adapter.isEnabled()) return "bt_off";
        if (!hasConnectPermission()) return "no_permission";
        wantConnection = true;
        reconnectAttempts = 0;
        try {
            connectTo(adapter.getRemoteDevice(addr));
        } catch (IllegalArgumentException e) {
            return "no_saved_device";
        }
        return "ok";
    }

    public void disconnect(boolean forget) {
        wantConnection = false;
        ui.removeCallbacks(reconnectTask);
        stopScan();
        closeGatt();
        heartRate = 0;
        battery = -1;
        if (forget) {
            core.prefs().edit()
                    .remove(AppCore.K_BAND_ADDR)
                    .remove(AppCore.K_BAND_NAME)
                    .putBoolean(AppCore.K_BAND_AUTO, false)
                    .apply();
            deviceName = "";
            deviceAddress = "";
        }
        setStatus("disconnected");
    }

    /** Called on app/service start: silently re-links the band if the user opted in. */
    public void autoConnectIfEnabled() {
        if (!core.prefs().getBoolean(AppCore.K_BAND_AUTO, false)) return;
        if (isConnected()) return;
        connectSaved();
    }

    public boolean isConnected() {
        return "connected".equals(status);
    }

    public int getHeartRate() {
        return heartRate;
    }

    public int getBattery() {
        return battery;
    }

    public String stateJson() {
        StringBuilder sb = new StringBuilder();
        sb.append('{');
        sb.append("\"status\":\"").append(status).append("\",");
        sb.append("\"name\":\"").append(Json.esc(deviceName)).append("\",");
        sb.append("\"address\":\"").append(Json.esc(deviceAddress)).append("\",");
        sb.append("\"hr\":").append(heartRate).append(',');
        sb.append("\"battery\":").append(battery).append(',');
        sb.append("\"lastBeatAt\":").append(lastBeatAt).append(',');
        sb.append("\"saved\":").append(core.prefs().getString(AppCore.K_BAND_ADDR, "").length() > 0).append(',');
        sb.append("\"auto\":").append(core.prefs().getBoolean(AppCore.K_BAND_AUTO, false));
        sb.append('}');
        return sb.toString();
    }

    public void setAutoConnect(boolean on) {
        core.prefs().edit().putBoolean(AppCore.K_BAND_AUTO, on).apply();
    }

    // ------------------------------------------------------------------
    // Internals used by the callback classes
    // ------------------------------------------------------------------

    void onDeviceFound(BluetoothDevice device, String advName) {
        if (device == null || !wantConnection) return;
        stopScan();
        if (advName != null && advName.length() > 0) deviceName = advName;
        connectTo(device);
    }

    void onScanFailed(int errorCode) {
        scanning = false;
        ui.removeCallbacks(scanTimeout);
        setStatus("scan_failed");
    }

    void onScanTimedOut() {
        if (isConnected()) return;
        stopScan();
        setStatus("not_found");
    }

    void onConnectionChanged(BluetoothGatt g, int newState) {
        if (newState == BluetoothProfile.STATE_CONNECTED) {
            reconnectAttempts = 0;
            setStatus("discovering");
            try {
                g.discoverServices();
            } catch (SecurityException e) {
                setStatus("no_permission");
            }
        } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
            closeGatt();
            heartRate = 0;
            if (wantConnection) {
                scheduleReconnect();
            } else {
                setStatus("disconnected");
            }
        }
    }

    void onServicesReady(BluetoothGatt g) {
        BluetoothGattService hrService = g.getService(SRV_HR);
        if (hrService == null) {
            // Band paired but broadcasting is off -> tell the user exactly that.
            setStatus("no_hr_service");
            return;
        }
        BluetoothGattCharacteristic hrChar = hrService.getCharacteristic(CHR_HR);
        if (hrChar == null) {
            setStatus("no_hr_service");
            return;
        }
        try {
            g.setCharacteristicNotification(hrChar, true);
            BluetoothGattDescriptor cccd = hrChar.getDescriptor(DSC_CCCD);
            if (cccd != null) {
                cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                g.writeDescriptor(cccd);
            }
        } catch (SecurityException e) {
            setStatus("no_permission");
            return;
        }
        deviceAddress = g.getDevice().getAddress();
        try {
            String n = g.getDevice().getName();
            if (n != null && n.length() > 0) deviceName = n;
        } catch (SecurityException e) {
            // name is optional
        }
        core.prefs().edit()
                .putString(AppCore.K_BAND_ADDR, deviceAddress)
                .putString(AppCore.K_BAND_NAME, deviceName)
                .apply();
        setStatus("connected");
    }

    /** CCCD write finished -> the radio is free, safe to read the battery level. */
    void onDescriptorWritten(BluetoothGatt g) {
        readBattery(g);
    }

    void onHeartRate(byte[] data) {
        if (data == null || data.length < 2) return;
        int flags = data[0] & 0xFF;
        int value;
        if ((flags & 0x01) != 0) {
            if (data.length < 3) return;
            value = (data[1] & 0xFF) | ((data[2] & 0xFF) << 8);
        } else {
            value = data[1] & 0xFF;
        }
        if (value <= 0 || value > 250) return;
        heartRate = value;
        lastBeatAt = System.currentTimeMillis();
        core.emit("band", stateJson());
    }

    void onBattery(byte[] data) {
        if (data == null || data.length < 1) return;
        battery = data[0] & 0xFF;
        core.emit("band", stateJson());
    }

    private void readBattery(BluetoothGatt g) {
        BluetoothGattService bs = g.getService(SRV_BATTERY);
        if (bs == null) return;
        BluetoothGattCharacteristic bc = bs.getCharacteristic(CHR_BATTERY);
        if (bc == null) return;
        try {
            g.readCharacteristic(bc);
        } catch (SecurityException e) {
            Log.w(TAG, "battery read denied");
        }
    }

    private void connectTo(BluetoothDevice device) {
        closeGatt();
        deviceAddress = device.getAddress();
        setStatus("connecting");
        try {
            if (Build.VERSION.SDK_INT >= 23) {
                gatt = device.connectGatt(ctx, false, gattCb, BluetoothDevice.TRANSPORT_LE);
            } else {
                gatt = device.connectGatt(ctx, false, gattCb);
            }
        } catch (SecurityException e) {
            setStatus("no_permission");
        }
    }

    private void scheduleReconnect() {
        if (reconnectAttempts >= MAX_RECONNECTS) {
            wantConnection = false;
            setStatus("disconnected");
            return;
        }
        reconnectAttempts++;
        setStatus("reconnecting");
        ui.removeCallbacks(reconnectTask);
        ui.postDelayed(reconnectTask, RECONNECT_DELAY_MS);
    }

    void retryConnect() {
        if (!wantConnection) return;
        connectSaved();
    }

    private void closeGatt() {
        if (gatt == null) return;
        try {
            gatt.disconnect();
            gatt.close();
        } catch (SecurityException e) {
            Log.w(TAG, "close denied");
        }
        gatt = null;
    }

    private void setStatus(String s) {
        status = s;
        core.emit("band", stateJson());
    }

    private boolean ensureAdapter() {
        if (adapter != null) return true;
        BluetoothManager bm = (BluetoothManager) ctx.getSystemService(Context.BLUETOOTH_SERVICE);
        if (bm == null) return false;
        adapter = bm.getAdapter();
        return adapter != null;
    }

    public boolean hasScanPermission() {
        if (Build.VERSION.SDK_INT >= 31) {
            return granted(Manifest.permission.BLUETOOTH_SCAN) && granted(Manifest.permission.BLUETOOTH_CONNECT);
        }
        return granted(Manifest.permission.ACCESS_FINE_LOCATION);
    }

    public boolean hasConnectPermission() {
        if (Build.VERSION.SDK_INT >= 31) return granted(Manifest.permission.BLUETOOTH_CONNECT);
        return true;
    }

    private boolean granted(String perm) {
        return ctx.checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED;
    }
}
