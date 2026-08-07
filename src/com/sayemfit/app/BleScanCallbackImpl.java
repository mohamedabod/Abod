package com.sayemfit.app;

import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanRecord;
import android.bluetooth.le.ScanResult;

import java.util.List;

/** Named (never anonymous) ScanCallback — the manual d8 step needs real classes. */
public class BleScanCallbackImpl extends ScanCallback {

    private final BleManager manager;

    public BleScanCallbackImpl(BleManager m) {
        this.manager = m;
    }

    @Override
    public void onScanResult(int callbackType, ScanResult result) {
        if (result == null) return;
        String name = null;
        ScanRecord rec = result.getScanRecord();
        if (rec != null) name = rec.getDeviceName();
        manager.onDeviceFound(result.getDevice(), name);
    }

    @Override
    public void onBatchScanResults(List<ScanResult> results) {
        if (results == null || results.isEmpty()) return;
        onScanResult(0, results.get(0));
    }

    @Override
    public void onScanFailed(int errorCode) {
        manager.onScanFailed(errorCode);
    }
}
