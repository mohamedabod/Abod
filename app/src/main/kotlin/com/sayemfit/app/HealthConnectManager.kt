package com.sayemfit.app

import android.content.Intent
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.aggregate.AggregationResultGroupedByPeriod
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDateTime
import java.time.Period
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * Reads health data out of Health Connect.
 *
 * Why this exists: Huawei Health still has no native Health Connect support
 * and its own Health Kit needs a verified-business approval that a personal
 * app cannot get. A bridge app (Health Sync and similar) writes Huawei data
 * into Health Connect, and this class reads it from there. Everything is
 * read-only — the app never writes health records.
 *
 * Each record type is read in its own try/catch: Health Connect throws when a
 * single permission is missing, and one denied type must not take down the
 * whole sync.
 */
class HealthConnectManager(
    private val activity: ComponentActivity,
    private val core: AppCore
) {

    companion object {
        const val STATUS_OK = "ok"
        const val STATUS_NOT_INSTALLED = "not_installed"
        const val STATUS_UPDATE_REQUIRED = "update_required"
        const val STATUS_UNSUPPORTED = "unsupported"

        private const val PROVIDER = "com.google.android.apps.healthdata"

        val PERMISSIONS: Set<String> = setOf(
            HealthPermission.getReadPermission(StepsRecord::class),
            HealthPermission.getReadPermission(DistanceRecord::class),
            HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
            HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
            HealthPermission.getReadPermission(HeartRateRecord::class),
            HealthPermission.getReadPermission(RestingHeartRateRecord::class),
            HealthPermission.getReadPermission(SleepSessionRecord::class),
            HealthPermission.getReadPermission(OxygenSaturationRecord::class),
            HealthPermission.getReadPermission(WeightRecord::class),
            HealthPermission.getReadPermission(BodyFatRecord::class),
            HealthPermission.getReadPermission(ExerciseSessionRecord::class)
        )
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var launcher: ActivityResultLauncher<Set<String>>? = null
    private var syncing = false

    /** Must be called from the activity's onCreate, before it reaches STARTED. */
    fun register() {
        if (launcher != null) return
        launcher = activity.registerForActivityResult(
            PermissionController.createRequestPermissionResultContract()
        ) { granted ->
            emitState(granted.size)
            if (granted.isNotEmpty()) sync(30)
        }
    }

    // ------------------------------------------------------------------
    // Availability and permissions
    // ------------------------------------------------------------------

    fun status(): String = when (HealthConnectClient.getSdkStatus(activity, PROVIDER)) {
        HealthConnectClient.SDK_AVAILABLE -> STATUS_OK
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> STATUS_UPDATE_REQUIRED
        HealthConnectClient.SDK_UNAVAILABLE -> STATUS_NOT_INSTALLED
        else -> STATUS_UNSUPPORTED
    }

    private fun client(): HealthConnectClient? =
        if (status() == STATUS_OK) HealthConnectClient.getOrCreate(activity) else null

    fun requestPermissions() {
        val l = launcher
        if (l == null || status() != STATUS_OK) {
            emitState(0)
            return
        }
        l.launch(PERMISSIONS)
    }

    /** Sends the user to the Play listing / system page for Health Connect. */
    fun openProvider() {
        val intent = when (status()) {
            STATUS_OK -> Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
            else -> Intent(Intent.ACTION_VIEW).setData(
                android.net.Uri.parse("market://details?id=$PROVIDER&url=healthconnect%3A%2F%2Fonboarding")
            )
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            activity.startActivity(intent)
        } catch (_: Exception) {
            try {
                activity.startActivity(
                    Intent(Intent.ACTION_VIEW).setData(
                        android.net.Uri.parse("https://play.google.com/store/apps/details?id=$PROVIDER")
                    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            } catch (_: Exception) {
            }
        }
    }

    fun refreshState() {
        val c = client()
        if (c == null) {
            emitState(0)
            return
        }
        scope.launch {
            val granted = try {
                c.permissionController.getGrantedPermissions().size
            } catch (_: Throwable) {
                0
            }
            emitState(granted)
        }
    }

    private fun emitState(granted: Int) {
        val o = JSONObject()
        o.put("status", status())
        o.put("granted", granted)
        o.put("total", PERMISSIONS.size)
        o.put("syncing", syncing)
        core.emit("healthState", o.toString())
    }

    // ------------------------------------------------------------------
    // Sync
    // ------------------------------------------------------------------

    fun sync(days: Int) {
        val c = client()
        if (c == null) {
            emitState(0)
            return
        }
        if (syncing) return
        syncing = true
        emitState(-1)

        scope.launch {
            val out = JSONObject()
            try {
                val zone = ZoneId.systemDefault()
                val endInstant = Instant.now()
                val startInstant = endInstant.minus(days.toLong(), ChronoUnit.DAYS)
                val endLocal = LocalDateTime.ofInstant(endInstant, zone)
                val startLocal = LocalDateTime.ofInstant(startInstant, zone)

                out.put("ok", true)
                out.put("days", readDailyBuckets(c, startLocal, endLocal))
                out.put("spo2", readSpo2(c, startInstant, endInstant))
                out.put("weights", readWeights(c, startInstant, endInstant))
                out.put("bodyFat", readBodyFat(c, startInstant, endInstant))
                out.put("workouts", readWorkouts(c, startInstant, endInstant))
                out.put("syncedAt", System.currentTimeMillis())
            } catch (e: Throwable) {
                out.put("ok", false)
                out.put("error", e.javaClass.simpleName + ": " + (e.message ?: ""))
            }
            syncing = false
            core.emit("health", out.toString())
            refreshState()
        }
    }

    /** One row per calendar day: steps, distance, calories, sleep, heart rate. */
    private suspend fun readDailyBuckets(
        c: HealthConnectClient,
        start: LocalDateTime,
        end: LocalDateTime
    ): JSONArray {
        val arr = JSONArray()
        val buckets: List<AggregationResultGroupedByPeriod> = try {
            c.aggregateGroupByPeriod(
                AggregateGroupByPeriodRequest(
                    metrics = setOf(
                        StepsRecord.COUNT_TOTAL,
                        DistanceRecord.DISTANCE_TOTAL,
                        ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL,
                        TotalCaloriesBurnedRecord.ENERGY_TOTAL,
                        SleepSessionRecord.SLEEP_DURATION_TOTAL,
                        HeartRateRecord.BPM_AVG,
                        HeartRateRecord.BPM_MAX,
                        HeartRateRecord.BPM_MIN,
                        RestingHeartRateRecord.BPM_AVG
                    ),
                    timeRangeFilter = TimeRangeFilter.between(start, end),
                    timeRangeSlicer = Period.ofDays(1)
                )
            )
        } catch (_: Throwable) {
            return arr
        }

        for (b in buckets) {
            val o = JSONObject()
            o.put("date", b.startTime.toLocalDate().toString())
            b.result[StepsRecord.COUNT_TOTAL]?.let { o.put("steps", it) }
            b.result[DistanceRecord.DISTANCE_TOTAL]?.let { o.put("distanceM", Math.round(it.inMeters)) }
            b.result[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]
                ?.let { o.put("activeCal", Math.round(it.inKilocalories)) }
            b.result[TotalCaloriesBurnedRecord.ENERGY_TOTAL]
                ?.let { o.put("totalCal", Math.round(it.inKilocalories)) }
            b.result[SleepSessionRecord.SLEEP_DURATION_TOTAL]?.let { o.put("sleepMs", it.toMillis()) }
            b.result[HeartRateRecord.BPM_AVG]?.let { o.put("hrAvg", it) }
            b.result[HeartRateRecord.BPM_MAX]?.let { o.put("hrMax", it) }
            b.result[HeartRateRecord.BPM_MIN]?.let { o.put("hrMin", it) }
            b.result[RestingHeartRateRecord.BPM_AVG]?.let { o.put("restingHr", it) }
            // Skip completely empty days so the UI is not padded with blanks.
            if (o.length() > 1) arr.put(o)
        }
        return arr
    }

    private suspend fun readSpo2(c: HealthConnectClient, from: Instant, to: Instant): JSONArray {
        val arr = JSONArray()
        try {
            val res = c.readRecords(
                ReadRecordsRequest(
                    recordType = OxygenSaturationRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(from, to)
                )
            )
            for (r in res.records) {
                arr.put(
                    JSONObject()
                        .put("ts", r.time.toEpochMilli())
                        .put("pct", r.percentage.value)
                )
            }
        } catch (_: Throwable) {
        }
        return arr
    }

    private suspend fun readWeights(c: HealthConnectClient, from: Instant, to: Instant): JSONArray {
        val arr = JSONArray()
        try {
            val res = c.readRecords(
                ReadRecordsRequest(
                    recordType = WeightRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(from, to)
                )
            )
            for (r in res.records) {
                arr.put(
                    JSONObject()
                        .put("ts", r.time.toEpochMilli())
                        .put("kg", Math.round(r.weight.inKilograms * 10.0) / 10.0)
                )
            }
        } catch (_: Throwable) {
        }
        return arr
    }

    private suspend fun readBodyFat(c: HealthConnectClient, from: Instant, to: Instant): JSONArray {
        val arr = JSONArray()
        try {
            val res = c.readRecords(
                ReadRecordsRequest(
                    recordType = BodyFatRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(from, to)
                )
            )
            for (r in res.records) {
                arr.put(
                    JSONObject()
                        .put("ts", r.time.toEpochMilli())
                        .put("pct", Math.round(r.percentage.value * 10.0) / 10.0)
                )
            }
        } catch (_: Throwable) {
        }
        return arr
    }

    private suspend fun readWorkouts(c: HealthConnectClient, from: Instant, to: Instant): JSONArray {
        val arr = JSONArray()
        try {
            val res = c.readRecords(
                ReadRecordsRequest(
                    recordType = ExerciseSessionRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(from, to)
                )
            )
            for (s in res.records) {
                val o = JSONObject()
                o.put("id", "hc_" + s.metadata.id)
                o.put("ts", s.startTime.toEpochMilli())
                o.put("durationMs", s.endTime.toEpochMilli() - s.startTime.toEpochMilli())
                o.put("type", mapExerciseType(s.exerciseType))
                s.title?.let { o.put("title", it) }

                // Per-session aggregates: distance, calories and heart rate are
                // separate record streams, joined here by the session's window.
                try {
                    val agg = c.aggregate(
                        AggregateRequest(
                            metrics = setOf(
                                DistanceRecord.DISTANCE_TOTAL,
                                ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL,
                                HeartRateRecord.BPM_AVG,
                                HeartRateRecord.BPM_MAX
                            ),
                            timeRangeFilter = TimeRangeFilter.between(s.startTime, s.endTime)
                        )
                    )
                    agg[DistanceRecord.DISTANCE_TOTAL]?.let {
                        o.put("distanceKm", Math.round(it.inMeters / 100.0) / 10.0)
                    }
                    agg[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.let {
                        o.put("calories", Math.round(it.inKilocalories))
                    }
                    agg[HeartRateRecord.BPM_AVG]?.let { o.put("avgHr", it) }
                    agg[HeartRateRecord.BPM_MAX]?.let { o.put("maxHr", it) }
                } catch (_: Throwable) {
                }
                arr.put(o)
            }
        } catch (_: Throwable) {
        }
        return arr
    }

    /** Health Connect exercise ids mapped onto this app's workout types. */
    private fun mapExerciseType(type: Int): String = when (type) {
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING,
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "walk"

        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "run"

        ExerciseSessionRecord.EXERCISE_TYPE_BIKING,
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "cycle"

        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL,
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "swim"

        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
        ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING,
        ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS -> "gym"

        else -> "other"
    }
}
