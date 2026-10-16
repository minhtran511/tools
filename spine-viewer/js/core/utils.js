"use strict";
/* ================= Helpers ================= */
const $ = id => document.getElementById(id);
const logBox = $("log");
function toast(msg, cls = "", ms = 4000) {
  const d = document.createElement("div"); d.textContent = msg; if (cls) d.className = cls;
  logBox.appendChild(d); while (logBox.children.length > 6) logBox.firstChild.remove();
  setTimeout(() => d.remove(), ms);
  if (cls === "err") console.error(msg); else console.log(msg);
}
const lower = s => s.toLowerCase();
const baseName = p => p.split("/").pop();
const dirName = p => { const i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i); };
const stripExt = n => n.replace(/\.(json|skel|bytes|txt|atlas|png|jpe?g|webp)$/i, "").replace(/\.(json|skel|bytes|txt|atlas|png|jpe?g|webp)$/i, "").replace(/\.(json|skel|atlas)$/i, "");
