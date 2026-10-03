/* global Office, Word */
/**
 * AEGIS Word add-in task pane (C-1).
 *
 * Calls AEGIS for an AI redline of the selected clause, then applies the change
 * in-document as REAL Word tracked changes (track-revisions on + replace the
 * selected range), so the author accepts or rejects each one — human review is
 * the gate. "Download .docx" fetches the same redline as a tracked-changes file.
 *
 * Requests are same-origin to the AEGIS app that serves this page and rely on
 * the user's existing AEGIS session cookie; no token is handled client-side.
 */
(function () {
  "use strict";

  var el = function (id) { return document.getElementById(id); };
  var statusEl, rationaleEl;

  function setStatus(msg, isError) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (isError ? " err" : "");
  }

  function setBusy(busy) {
    ["apply", "download", "useSelection"].forEach(function (id) { el(id).disabled = busy; });
  }

  function readBody() {
    return {
      original: el("original").value || "",
      instruction: el("instruction").value || "",
    };
  }

  function loadSelection() {
    return Word.run(function (context) {
      var sel = context.document.getSelection();
      sel.load("text");
      return context.sync().then(function () {
        if (sel.text && sel.text.trim()) el("original").value = sel.text;
      });
    });
  }

  function requestRedline(body) {
    return fetch("/api/office/word/redline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j.ok) throw new Error((j && j.error) || ("Request failed (" + r.status + ")"));
        return j;
      });
    });
  }

  /** Replace the current selection with the revised text as a tracked change. */
  function applyRevision(revised) {
    return Word.run(function (context) {
      var doc = context.document;
      // Turn on track changes so the replacement is recorded as a revision.
      try { doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll; } catch (e) { /* older hosts */ }
      var sel = doc.getSelection();
      sel.insertText(revised, Word.InsertLocation.replace);
      return context.sync();
    });
  }

  function onApply() {
    var body = readBody();
    if (!body.original.trim()) { setStatus("Select a clause or paste one first.", true); return; }
    if (!body.instruction.trim()) { setStatus("Describe what should change.", true); return; }
    setBusy(true); setStatus("Asking AEGIS for a redline…");
    requestRedline(body)
      .then(function (j) {
        rationaleEl.hidden = false;
        rationaleEl.textContent = (j.degraded ? "AI unavailable — no change proposed. " : "") + (j.rationale || "");
        return applyRevision(j.revised).then(function () {
          setStatus(j.degraded ? "No automated change — review manually." : "Redline applied as tracked changes. Review and accept/reject.");
        });
      })
      .catch(function (e) { setStatus(e.message || String(e), true); })
      .then(function () { setBusy(false); });
  }

  function onDownload() {
    var body = readBody();
    if (!body.original.trim() || !body.instruction.trim()) { setStatus("Enter a clause and an instruction first.", true); return; }
    setBusy(true); setStatus("Building redline .docx…");
    fetch("/api/office/word/redline-docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    })
      .then(function (r) {
        if (!r.ok) throw new Error("Download failed (" + r.status + ")");
        return r.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = "clause-redline.docx";
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        setStatus("Downloaded.");
      })
      .catch(function (e) { setStatus(e.message || String(e), true); })
      .then(function () { setBusy(false); });
  }

  Office.onReady(function (info) {
    statusEl = el("status"); rationaleEl = el("rationale");
    if (!info || info.host !== Office.HostType.Word) {
      setStatus("Open this add-in in Microsoft Word.", true);
      return;
    }
    el("useSelection").addEventListener("click", function () {
      loadSelection().catch(function (e) { setStatus(e.message || String(e), true); });
    });
    el("apply").addEventListener("click", onApply);
    el("download").addEventListener("click", onDownload);
    // Pre-fill from the current selection on load.
    loadSelection().catch(function () { /* no selection yet */ });
  });
})();
