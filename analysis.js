/* =====================================================================
   analysis.js — حسابات لوحة التحليلات (دوال نقية قابلة للاختبار)
   الصف الواحد: { t, role, aware, q:[10 أرقام 1..5], open:[4 نصوص] }
   ===================================================================== */
(function (root) {
  "use strict";

  var ROLE_CODES = ["teacher", "parent", "student"];
  var AWARE_CODES = ["yes", "some", "no"];

  function round(x, d) { var m = Math.pow(10, d == null ? 2 : d); return Math.round(x * m) / m; }

  function validRow(r) {
    if (!r || ROLE_CODES.indexOf(r.role) < 0 || AWARE_CODES.indexOf(r.aware) < 0) return false;
    if (!Array.isArray(r.q)) return false;
    for (var i = 0; i < r.q.length; i++) {
      if (!(r.q[i] >= 1 && r.q[i] <= 5)) return false;
    }
    return true;
  }

  function mean(arr) {
    if (!arr.length) return null;
    var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  /* توزيع إجابات عبارة واحدة داخل مجموعة صفوف */
  function statementStats(rows, idx) {
    var counts = [0, 0, 0, 0, 0, 0]; // الفهرس = القيمة 1..5
    var vals = [];
    rows.forEach(function (r) {
      var v = r.q[idx];
      if (v >= 1 && v <= 5) { counts[v]++; vals.push(v); }
    });
    var n = vals.length;
    return {
      n: n,
      counts: counts,
      mean: n ? round(mean(vals), 2) : null,
      agreePct: n ? round((counts[4] + counts[5]) / n * 100, 0) : null
    };
  }

  /* تطبيع الكلمات العربية لعدّ القيم المقترحة */
  function normalizeWord(w) {
    return w
      .replace(/[ً-ٰٟـ]/g, "")   // تشكيل وتطويل
      .replace(/[إأآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/^ال/, "")
      .trim();
  }

  function splitValues(text) {
    return String(text || "")
      .replace(/\s+و(?=ال)/g, "،")                  // «الإبداع والانتماء» ← فاصل قبل «وال»
      .split(/[،,؛;:\n\r\t\/\\|•·\-–—\.؟\?!؟()\[\]"«»]+|\s+و\s+|\s{2,}/)
      .map(function (s) { return s.trim(); })
      .reduce(function (acc, piece) {
        // قطعة من ٣ كلمات فأكثر بلا فواصل غالبًا قائمة قيم مفصولة بمسافات: «الصدق الأمانة الإبداع»
        var words = piece.split(/\s+/);
        return acc.concat(words.length >= 3 ? words : [piece]);
      }, [])
      .filter(function (s) { return s.length > 1 && s.length <= 30; });
  }

  function valuesFrequency(rows) {
    var map = {};
    rows.forEach(function (r) {
      var seen = {};
      splitValues(r.open && r.open[2]).forEach(function (raw) {
        var key = normalizeWord(raw);
        if (!key || seen[key]) return;      // لا نحسب الكلمة أكثر من مرة للمشاركة نفسها
        seen[key] = true;
        if (!map[key]) map[key] = { key: key, count: 0, forms: {} };
        map[key].count++;
        map[key].forms[raw] = (map[key].forms[raw] || 0) + 1;
      });
    });
    return Object.keys(map).map(function (k) {
      var m = map[k], best = null, bc = -1;
      Object.keys(m.forms).forEach(function (f) { if (m.forms[f] > bc) { bc = m.forms[f]; best = f; } });
      return { label: best, count: m.count };
    }).sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label, "ar"); });
  }

  function perDay(rows) {
    var map = {};
    rows.forEach(function (r) {
      var d = String(r.t || "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) map[d] = (map[d] || 0) + 1;
    });
    return Object.keys(map).sort().map(function (d) { return { day: d, count: map[d] }; });
  }

  /* ---------- الدالة الرئيسية ---------- */
  function compute(allRows, cfg) {
    var rows = (allRows || []).filter(validRow);
    var nSt = cfg.STATEMENTS.length;

    var byRole = {};
    ROLE_CODES.forEach(function (c) { byRole[c] = rows.filter(function (r) { return r.role === c; }); });

    var aware = { all: { yes: 0, some: 0, no: 0 } };
    ROLE_CODES.forEach(function (c) { aware[c] = { yes: 0, some: 0, no: 0 }; });
    rows.forEach(function (r) { aware.all[r.aware]++; aware[r.role][r.aware]++; });

    var statements = cfg.STATEMENTS.map(function (s, i) {
      var st = statementStats(rows, i);
      var roles = {};
      ROLE_CODES.forEach(function (c) { roles[c] = statementStats(byRole[c], i); });
      return { index: i, axis: s.axis, text: s.text, all: st, roles: roles };
    });

    /* متوسط المحاور */
    var axes = Object.keys(cfg.AXES).map(function (key) {
      var idxs = [];
      cfg.STATEMENTS.forEach(function (s, i) { if (s.axis === key) idxs.push(i); });
      var vals = [];
      rows.forEach(function (r) { idxs.forEach(function (i) { if (r.q[i] >= 1) vals.push(r.q[i]); }); });
      return { key: key, label: cfg.AXES[key], mean: vals.length ? round(mean(vals), 2) : null, count: idxs.length };
    });

    /* المتوسط العام */
    var allVals = [];
    rows.forEach(function (r) { r.q.forEach(function (v) { allVals.push(v); }); });
    var overallMean = allVals.length ? round(mean(allVals), 2) : null;

    /* أعلى وأدنى العبارات */
    var ranked = statements.filter(function (s) { return s.all.n > 0; })
      .slice().sort(function (a, b) { return b.all.mean - a.all.mean || a.index - b.index; });

    var last = rows.length ? rows.map(function (r) { return String(r.t); }).sort().pop() : null;

    return {
      n: rows.length,
      roleCounts: { teacher: byRole.teacher.length, parent: byRole.parent.length, student: byRole.student.length },
      aware: aware,
      statements: statements,
      axes: axes,
      overallMean: overallMean,
      top: ranked.slice(0, 3),
      bottom: ranked.slice(-3).reverse(),
      values: valuesFrequency(rows),
      perDay: perDay(rows),
      lastTime: last
    };
  }

  /* ---------- تصدير CSV (مع BOM ليفتح بالعربية سليمًا في Excel) ---------- */
  function csvCell(v) {
    var s = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;     // حماية من حقن الصيغ في Excel
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function toCSV(rows, cfg) {
    var roleLabel = {}, awareLabel = {};
    cfg.ROLES.forEach(function (r) { roleLabel[r.code] = r.label; });
    cfg.AWARE.forEach(function (a) { awareLabel[a.code] = a.label; });
    var head = ["التاريخ والوقت", "صفة المشارك", "الاطلاع المسبق"]
      .concat(cfg.STATEMENTS.map(function (s, i) { return "ع" + (i + 1); }))
      .concat(cfg.OPEN_QUESTIONS.map(function (q) { return q.short; }));
    var lines = [head.map(csvCell).join(",")];
    rows.filter(validRow).forEach(function (r) {
      var line = [r.t, roleLabel[r.role], awareLabel[r.aware]].concat(r.q).concat(
        cfg.OPEN_QUESTIONS.map(function (q, i) { return (r.open && r.open[i]) || ""; }));
      lines.push(line.map(csvCell).join(","));
    });
    return "﻿" + lines.join("\r\n");
  }

  /* ---------- بيانات تجريبية (لمعاينة اللوحة قبل جمع إجابات حقيقية) ---------- */
  function demoRows(count, cfg) {
    var seed = 20261025;
    function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
    function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
    var likes = ["وضوح الرؤية وارتباطها برؤية عمان 2040", "التركيز على الإبداع", "الشراكة مع الأسرة", "بساطة الصياغة"];
    var tweaks = ["إضافة التقنية والابتكار", "ذكر الصحة النفسية للطالبات", "لا شيء، كل شيء واضح", ""];
    var vals = ["الإبداع، المسؤولية، الاحترام", "التعاون والانتماء والتميز", "الانضباط، الصدق، المسؤولية", "الاحترام والتعاون والإبداع", "الأمانة، الانتماء، التميز", ""];
    var acts = ["إذاعة مدرسية أسبوعية عن القيم", "يوم مفتوح لأولياء الأمور", "مسابقة أفضل مبادرة طلابية", "لوحة قيم في كل صف", ""];
    var out = [], base = new Date(Date.UTC(2026, 9, 18, 6, 0, 0));
    for (var i = 0; i < count; i++) {
      var roleRnd = rnd();
      var role = roleRnd < 0.2 ? "teacher" : roleRnd < 0.55 ? "parent" : "student";
      var ar = rnd();
      var aware = ar < 0.45 ? "yes" : ar < 0.8 ? "some" : "no";
      var bias = role === "teacher" ? 0.45 : role === "parent" ? 0.2 : 0;
      var q = cfg.STATEMENTS.map(function (s, k) {
        var x = 3.3 + bias + (k === 9 ? -0.35 : 0) + (k === 5 ? 0.2 : 0) + (rnd() - 0.5) * 2.4;
        return Math.max(1, Math.min(5, Math.round(x)));
      });
      var t = new Date(base.getTime() + Math.floor(rnd() * 7) * 86400000 + Math.floor(rnd() * 36000000));
      out.push({
        t: t.toISOString().slice(0, 19).replace("T", " "),
        role: role, aware: aware, q: q,
        open: [pick(likes), pick(tweaks), pick(vals), pick(acts)]
      });
    }
    return out.sort(function (a, b) { return a.t < b.t ? -1 : 1; });
  }

  var api = {
    compute: compute, toCSV: toCSV, demoRows: demoRows, validRow: validRow,
    valuesFrequency: valuesFrequency, normalizeWord: normalizeWord, splitValues: splitValues,
    statementStats: statementStats
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SurveyAnalysis = api;
})(typeof window !== "undefined" ? window : globalThis);
