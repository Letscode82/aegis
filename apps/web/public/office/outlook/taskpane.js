/* global Office */
/**
 * AEGIS Outlook add-in task pane (C-2).
 *
 * Reads the open message (subject / sender / body / thread) and files it into
 * AEGIS intake via the same-origin API, which runs it through the same
 * `ingestInboundEmail` pipeline as the webhook and the mailbox poller. Relies on
 * the user's existing AEGIS session; no token is handled client-side.
 */
(function () {
  "use strict";

  var el = function (id) { return document.getElementById(id); };
  var statusEl, item;

  function setStatus(msg, cls) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (cls ? " " + cls : "");
  }

  function getBodyText() {
    return new Promise(function (resolve) {
      try {
        item.body.getAsync(Office.CoercionType.Text, function (r) {
          resolve(r && r.status === Office.AsyncResultStatus.Succeeded ? r.value || "" : "");
        });
      } catch (e) { resolve(""); }
    });
  }

  function collect() {
    var from = item.from || {};
    return getBodyText().then(function (body) {
      return {
        from: from.displayName || undefined,
        fromEmail: from.emailAddress || undefined,
        subject: item.subject || "(no subject)",
        body: body,
        threadId: item.conversationId || undefined,
        messageId: item.internetMessageId || undefined,
        hasAttachments: Array.isArray(item.attachments) && item.attachments.length > 0,
      };
    });
  }

  function onFile() {
    el("file").disabled = true;
    setStatus("Filing to AEGIS…");
    collect()
      .then(function (payload) {
        return fetch("/api/office/outlook/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        });
      })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok || !j.ok) throw new Error((j && j.error) || ("Request failed (" + r.status + ")"));
          return j;
        });
      })
      .then(function (j) {
        setStatus(j.deduped ? "Already filed as " + j.ticketId + "." : "Filed as " + j.ticketId + ".", "ok");
      })
      .catch(function (e) {
        setStatus(e.message || String(e), "err");
        el("file").disabled = false;
      });
  }

  Office.onReady(function (info) {
    statusEl = el("status");
    if (!info || info.host !== Office.HostType.Outlook) {
      setStatus("Open this add-in in Microsoft Outlook.", "err");
      return;
    }
    item = Office.context.mailbox.item;
    var from = item.from || {};
    el("from").textContent = (from.displayName || from.emailAddress || "—");
    el("subject").textContent = item.subject || "(no subject)";
    el("file").addEventListener("click", onFile);
  });
})();
