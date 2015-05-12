"use strict";
define(["lib/helper"], function (Helper) {
  function streamElement(type, stream) {
    var el = document.createElement(type);
    el.destroy = stream.onValue(update);

    function update(d) {
      el.textContent = d;
    }

    return el;
  }

  function streamNode(stream) {
    var el = document.createTextNode("");
    el.destroy = stream.onValue(update);

    function update(d) {
      el.textContent = d;
    }

    return el;
  }

  function mkRow(table, label, stream) {
    var tr = document.createElement("tr");
    var th = document.createElement("th");
    var td = streamElement("td", stream);
    th.textContent = label;
    tr.appendChild(th);
    tr.appendChild(td);
    table.appendChild(tr);

    tr.destroy = function () {
      td.destroy();
      table.removeChild(tr);
    }

    return tr;
  }

  function mkTrafficRow(table, children, label, stream, selector) {
    var tr = document.createElement("tr");
    var th = document.createElement("th");
    var td = document.createElement("td");
    th.textContent = label;

    var traffic = stream.slidingWindow(2, 2);
    var pkts = streamNode(traffic.map(deltaUptime(selector + ".packets")).map(prettyPackets));
    var bw = streamNode(traffic.map(deltaUptime(selector + ".bytes")).map(prettyBits));
    var bytes = streamNode(stream.map(selector).map(".bytes").map(prettyBytes));

    td.appendChild(pkts);
    td.appendChild(document.createElement("br"));
    td.appendChild(bw);
    td.appendChild(document.createElement("br"));
    td.appendChild(bytes);

    tr.appendChild(th);
    tr.appendChild(td);
    table.appendChild(tr);

    children.push(pkts);
    children.push(bw);
    children.push(bytes);
  }

  function mkMeshVPN(el, stream) {
    var children = {};
    var init = false;
    var h = document.createElement("h3");
    h.textContent = "Mesh-VPN";

    var table = document.createElement("table");

    var unsubscribe = stream.onValue( function (d) {
      if (d === undefined) {
        clear();
      } else {
        if (!init) {
          init = true;
          el.appendChild(h);
          el.appendChild(table);
        }

        for (var peer in d) {
          if (!(peer in children)) {
            children[peer] = mkRow(table, peer, stream.startWith(d).map("." + peer)
                             .filter(function (d) { return d !== undefined })
                             .map(prettyPeer));
          }
        }

        for (var peer in children) {
          if (!(peer in d)) {
            console.log("removed" + peer);
            children[peer].destroy();
            children[peer] = undefined;
          }
        }
      }
    })

    function clear() {
      if (init) {
        init = false;
        el.removeChild(h);
        el.removeChild(table);
      }

      for (var peer in children)
        children[peer].destroy();

      children = {};
    }

    function destroy() {
      unsubscribe();
      clear();
    }

    return { destroy: destroy }
  }

  function deltaUptime(selector) {
    return function (d) {
      var deltaTime = d[1].uptime - d[0].uptime;
      var d0 = Helper.dictGet(d[0], selector.split(".").splice(1));
      var d1 = Helper.dictGet(d[1], selector.split(".").splice(1));

      return (d1 - d0) / deltaTime;
    }
  }

  function prettyPeer(d) {
    var s = d ? "verbunden" : "nicht verbunden";

    if (d)
      s += " (" + prettyUptime(d.established) + ")";

    return s;
  }

  function prettyPackets(d) {
    var v = new Intl.NumberFormat("de-DE", {maximumFractionDigits: 0}).format(d);
    return v + " Pakete/s";
  }

  function prettyPrefix(prefixes, step, d) {
    var prefix = 0;

    while (d > step && prefix < 4) {
      d /= step;
      prefix++;
    }

    d = new Intl.NumberFormat("de-DE", {maximumSignificantDigits: 3}).format(d);
    return d + " " + prefixes[prefix];
  }

  function prettyBits(d) {
    return prettyPrefix([ "bps", "kbps", "Mbps", "Gbps" ], 1024, d * 8);
  }

  function prettyBytes(d) {
    return prettyPrefix([ "B", "kB", "MB", "GB" ], 1024, d);
  }

  function prettyUptime(seconds) {
    var minutes = Math.round(seconds/60);

    var days = Math.floor(minutes / 1440);
    var hours = Math.floor((minutes % 1440) / 60);
    var minutes = Math.floor(minutes % 60);

    var out = "";

    if (days == 1)
      out += "1 Tag, ";
    else if (days > 1)
      out += days + " Tage, ";

    out += hours + ":";

    if (minutes < 10)
      out += "0";

    out += minutes;

    return out;
  }

  function prettyNVRAM(usage) {
    return new Intl.NumberFormat("de-DE", {maximumSignificantDigits: 3}).format(usage*100) + "% belegt";
  }

  function prettyLoad(load) {
    return new Intl.NumberFormat("de-DE", {maximumSignificantDigits: 3}).format(load);
  }

  function prettyRAM(memory) {
    var usage = 1 - (memory.free + memory.buffers) / memory.total;
    return prettyNVRAM(usage);
  }

  return function (stream) {
    var children = [];
    var el = document.createElement("div");
    var table = document.createElement("table");

    children.push(mkRow(table, "Laufzeit", stream.map(".uptime").map(prettyUptime)));
    children.push(mkRow(table, "Systemlast", stream.map(".loadavg").map(prettyLoad)));
    children.push(mkRow(table, "RAM", stream.map(".memory").map(prettyRAM)));
    children.push(mkRow(table, "NVRAM", stream.map(".rootfs_usage").map(prettyNVRAM)));
    children.push(mkRow(table, "Gateway", stream.map(".gateway")));
    children.push(mkRow(table, "Clients", stream.map(".clients.total")));

    var pre = document.createElement("pre");

    el.appendChild(table);

    var h = document.createElement("h3");
    h.textContent = "Traffic";
    el.appendChild(h);

    table = document.createElement("table");

    mkTrafficRow(table, children, "Gesendet", stream, ".traffic.rx");
    mkTrafficRow(table, children, "Empfangen", stream, ".traffic.tx");
    mkTrafficRow(table, children, "Weitergeleitet", stream, ".traffic.forward");

    el.appendChild(table);

    children.push(mkMeshVPN(el, stream.map(".mesh_vpn")));

    function destroy() {
      children.forEach(function (d) {d.destroy()});
    }

    return { title: document.createTextNode("Statistik")
           , content: el
           , destroy: destroy
           }
  }
})
