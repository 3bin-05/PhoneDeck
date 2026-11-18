package org.phonedeck.android

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log

class NsdDiscoveryHelper(
    context: Context,
    private val onServiceFound: (host: String, port: Int, name: String) -> Unit
) {
    private val nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val serviceType = "_phonedeck._tcp."
    private var isDiscovering = false

    private val discoveryListener = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(regType: String) {
            isDiscovering = true
            Log.d("PhoneDeckNSD", "Service discovery started: $regType")
        }

        override fun onServiceFound(service: NsdServiceInfo) {
            Log.d("PhoneDeckNSD", "Service discovery success: $service")
            if (service.serviceType == serviceType || service.serviceType.contains("phonedeck")) {
                nsdManager.resolveService(service, object : NsdManager.ResolveListener {
                    override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                        Log.e("PhoneDeckNSD", "Resolve failed: $errorCode")
                    }

                    override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                        val host = serviceInfo.host.hostAddress ?: return
                        val port = serviceInfo.port
                        Log.d("PhoneDeckNSD", "Resolved service: $host:$port")
                        onServiceFound(host, port, serviceInfo.serviceName)
                    }
                })
            }
        }

        override fun onServiceLost(service: NsdServiceInfo) {
            Log.e("PhoneDeckNSD", "service lost: $service")
        }

        override fun onDiscoveryStopped(serviceType: String) {
            isDiscovering = false
            Log.i("PhoneDeckNSD", "Discovery stopped: $serviceType")
        }

        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
            isDiscovering = false
            Log.e("PhoneDeckNSD", "Discovery failed: Error code: $errorCode")
            nsdManager.stopServiceDiscovery(this)
        }

        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
            Log.e("PhoneDeckNSD", "Stop Discovery failed: Error code: $errorCode")
            nsdManager.stopServiceDiscovery(this)
        }
    }

    fun start() {
        if (!isDiscovering) {
            try {
                nsdManager.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
            } catch (e: Exception) {
                Log.e("PhoneDeckNSD", "Failed to start discovery", e)
            }
        }
    }

    fun stop() {
        if (isDiscovering) {
            try {
                nsdManager.stopServiceDiscovery(discoveryListener)
            } catch (e: Exception) {
                Log.e("PhoneDeckNSD", "Failed to stop discovery", e)
            }
            isDiscovering = false
        }
    }
}
