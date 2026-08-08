package com.sayemfit.app;

import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattCallback;

import java.util.UUID;

/** Named (never anonymous) GATT callback. */
public class GattCallbackImpl extends BluetoothGattCallback {

    private final BleManager manager;

    public GattCallbackImpl(BleManager m) {
        this.manager = m;
    }

    @Override
    public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
        manager.onConnectionChanged(gatt, newState);
    }

    @Override
    public void onServicesDiscovered(BluetoothGatt gatt, int status) {
        if (status == BluetoothGatt.GATT_SUCCESS) manager.onServicesReady(gatt);
    }

    @Override
    public void onDescriptorWrite(BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
        manager.onDescriptorWritten(gatt);
    }

    @Override
    public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic ch) {
        UUID id = ch.getUuid();
        if (BleManager.CHR_HR.equals(id)) manager.onHeartRate(ch.getValue());
    }

    @Override
    public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic ch, int status) {
        if (status != BluetoothGatt.GATT_SUCCESS) return;
        UUID id = ch.getUuid();
        if (BleManager.CHR_BATTERY.equals(id)) manager.onBattery(ch.getValue());
    }
}
