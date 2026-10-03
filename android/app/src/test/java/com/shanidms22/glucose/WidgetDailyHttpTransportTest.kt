package com.shanidms22.glucose

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.net.InetAddress
import java.net.ServerSocket
import java.net.URI
import java.net.URLDecoder
import java.util.Collections
import java.util.TimeZone
import kotlin.concurrent.thread

/** Uses the production HttpURLConnection transport, real HTTP status codes, and JSON text. */
class WidgetDailyHttpTransportTest {
  @Test fun `legacy Nightscout HTTP serves latest BG and daily summary without object sort errors`() {
    val zone = TimeZone.getTimeZone("Asia/Jerusalem")
    val now = widgetParseTimestamp("2026-09-28T07:54:00Z")!!
    val start = widgetStartOfDayMs(now, zone)
    val readings = JSONArray().apply {
      var time = start
      while (time < now) {
        put(JSONObject().put("_id", time.toString()).put("date", time).put("sgv", 64).put("type", "sgv"))
        time += 5 * 60_000L
      }
    }
    val wireStatuses = Collections.synchronizedList(mutableListOf<Int>())
    val server = ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"))
    val worker = thread(isDaemon = true) {
      while (!server.isClosed) {
        val connection = runCatching { server.accept() }.getOrNull() ?: break
        connection.use { socket ->
          socket.soTimeout = 5000
          val reader = socket.getInputStream().bufferedReader()
          val request = reader.readLine()
          while (!reader.readLine().isNullOrEmpty()) { /* consume HTTP headers */ }
          val uri = URI(request.split(' ')[1])
          val query = uri.rawQuery.orEmpty().split('&').associate { part ->
            val pieces = part.split('=', limit = 2)
            URLDecoder.decode(pieces[0], "UTF-8") to URLDecoder.decode(pieces.getOrElse(1) { "" }, "UTF-8")
          }
          val path = uri.path
          // https://github.com/nightscout/cgm-remote-monitor/blob/14.2.6/lib/server/entries.js
          // https://github.com/mongodb/node-mongodb-native/blob/3.6/lib/utils.js
          // Nightscout 14 entries/treatments pass req.query.sort unchanged. MongoDB 3.6's
          // formattedOrderClause preserves object values as strings, which MongoDB rejects.
          val rejectedSort = query.keys.any { it.startsWith("sort[") }
          val status = if (rejectedSort) 500 else 200
          val body = when {
            rejectedSort -> "{\"message\":\"Illegal key in sort specification\"}"
            path.contains("entries") -> readings.toString()
            else -> "[]"
          }.toByteArray(Charsets.UTF_8)
          wireStatuses.add(status)
          val headers = "HTTP/1.1 $status ${if (status == 200) "OK" else "Internal Server Error"}\r\nContent-Type: application/json\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n"
          socket.getOutputStream().apply { write(headers.toByteArray(Charsets.US_ASCII)); write(body); flush() }
        }
      }
    }
    try {
      val base = "http://127.0.0.1:${server.localPort}"
      val latest = latestWidgetBgFromEntries(fetchWidgetJsonArray("$base/api/v1/entries.json?count=42", null))
      assertEquals(64, latest!!.sgv)
      assertTrue("epoch timestamps must survive actual JSON decoding as Long", latest.date > Int.MAX_VALUE)
      val result = fetchWidgetDailySummary(base, null, 70, 180, now, zone)
      val saved = parseWidgetDailySummary(widgetDailySummaryJson(result.summary), now, zone)!!
      assertNotNull("Live BG succeeds but today's HTTP range must not be lost to an unsupported sort query", saved.range)
      assertEquals(100, saved.range!!.lowPercent)
      assertNotNull("Today's insulin must survive the same legacy HTTP server", saved.insulin?.today)
      assertTrue("All production requests should use supported v1 queries", wireStatuses.all { it == 200 })
    } finally { server.close(); worker.join(1000) }
  }
}
