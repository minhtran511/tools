"use strict";
/* ================= Spine 3.6 / 3.7 binary reader =================
   spine-ts 3.6/3.7 chính thức không có SkeletonBinary -> port từ spine-libgdx (SkeletonBinary.java) */
function makeLegacyBinaryReader(spine, minor) {
  const is37 = minor >= 7;
  const AT = ["region", "boundingbox", "mesh", "linkedmesh", "path", "point", "clipping"];
  function rgba(c, v) { c.set(((v >>> 24) & 255) / 255, ((v >>> 16) & 255) / 255, ((v >>> 8) & 255) / 255, (v & 255) / 255); }
  function rgb(c, v) { c.set(((v >>> 16) & 255) / 255, ((v >>> 8) & 255) / 255, (v & 255) / 255, 1); }
  return {
    scale: 1,
    readSkeletonData(u8, attachmentLoader) {
      const scale = this.scale, input = new BinReader(u8), sd = new spine.SkeletonData();
      const linkedMeshes = [];
      sd.hash = input.string() || null; sd.version = input.string() || null;
      sd.width = input.float(); sd.height = input.float();
      const nonessential = input.bool();
      if (nonessential) { sd.fps = input.float(); sd.imagesPath = input.string() || null; if (is37) sd.audioPath = input.string() || null; }
      for (let i = 0, n = input.varint(); i < n; i++) {
        const name = input.string(), parent = i === 0 ? null : sd.bones[input.varint()];
        const d = new spine.BoneData(i, name, parent);
        d.rotation = input.float(); d.x = input.float() * scale; d.y = input.float() * scale;
        d.scaleX = input.float(); d.scaleY = input.float(); d.shearX = input.float(); d.shearY = input.float();
        d.length = input.float() * scale; d.transformMode = input.varint();
        if (nonessential) input.int32();
        sd.bones.push(d);
      }
      for (let i = 0, n = input.varint(); i < n; i++) {
        const name = input.string(), bone = sd.bones[input.varint()], d = new spine.SlotData(i, name, bone);
        rgba(d.color, input.int32());
        const dark = input.int32(); if (dark !== -1) { d.darkColor = new spine.Color(1, 1, 1, 1); rgb(d.darkColor, dark); }
        d.attachmentName = input.string(); d.blendMode = input.varint();
        sd.slots.push(d);
      }
      for (let i = 0, n = input.varint(); i < n; i++) {
        const d = new spine.IkConstraintData(input.string()); d.order = input.varint();
        for (let j = 0, m = input.varint(); j < m; j++) d.bones.push(sd.bones[input.varint()]);
        d.target = sd.bones[input.varint()]; d.mix = input.float(); d.bendDirection = input.byte();
        if (is37) { d.compress = input.bool(); d.stretch = input.bool(); d.uniform = input.bool(); }
        sd.ikConstraints.push(d);
      }
      for (let i = 0, n = input.varint(); i < n; i++) {
        const d = new spine.TransformConstraintData(input.string()); d.order = input.varint();
        for (let j = 0, m = input.varint(); j < m; j++) d.bones.push(sd.bones[input.varint()]);
        d.target = sd.bones[input.varint()]; d.local = input.bool(); d.relative = input.bool();
        d.offsetRotation = input.float(); d.offsetX = input.float() * scale; d.offsetY = input.float() * scale;
        d.offsetScaleX = input.float(); d.offsetScaleY = input.float(); d.offsetShearY = input.float();
        d.rotateMix = input.float(); d.translateMix = input.float(); d.scaleMix = input.float(); d.shearMix = input.float();
        sd.transformConstraints.push(d);
      }
      for (let i = 0, n = input.varint(); i < n; i++) {
        const d = new spine.PathConstraintData(input.string()); d.order = input.varint();
        for (let j = 0, m = input.varint(); j < m; j++) d.bones.push(sd.bones[input.varint()]);
        d.target = sd.slots[input.varint()];
        d.positionMode = input.varint(); d.spacingMode = input.varint(); d.rotateMode = input.varint();
        d.offsetRotation = input.float(); d.position = input.float(); if (d.positionMode === 0) d.position *= scale;
        d.spacing = input.float(); if (d.spacingMode === 0 || d.spacingMode === 1) d.spacing *= scale;
        d.rotateMix = input.float(); d.translateMix = input.float();
        sd.pathConstraints.push(d);
      }
      const readVertices = (vertexCount) => {
        const len = vertexCount << 1, out = {};
        if (!input.bool()) { out.vertices = readFloats(len, scale); return out; }
        const weights = [], bones = [];
        for (let i = 0; i < vertexCount; i++) {
          const bc = input.varint(); bones.push(bc);
          for (let j = 0; j < bc; j++) { bones.push(input.varint()); weights.push(input.float() * scale, input.float() * scale, input.float()); }
        }
        out.vertices = spine.Utils.toFloatArray(weights); out.bones = bones; return out;
      };
      const readFloats = (n, s) => { const a = spine.Utils.newFloatArray(n); for (let i = 0; i < n; i++) a[i] = input.float() * s; return a; };
      const readShorts = () => { const n = input.varint(), a = new Array(n); for (let i = 0; i < n; i++) a[i] = input.short(); return a; };
      const readAttachment = (skin, slotIndex, attName) => {
        let name = input.string(); if (name == null) name = attName;
        const type = AT[input.byte()];
        switch (type) {
          case "region": {
            let path = input.string(); const rot = input.float(), x = input.float(), y = input.float(), sx = input.float(), sy = input.float(),
              w = input.float(), h = input.float(), color = input.int32();
            if (path == null) path = name;
            const r = attachmentLoader.newRegionAttachment(skin, name, path); if (!r) return null;
            r.path = path; r.x = x * scale; r.y = y * scale; r.scaleX = sx; r.scaleY = sy; r.rotation = rot;
            r.width = w * scale; r.height = h * scale; rgba(r.color, color); r.updateOffset(); return r;
          }
          case "boundingbox": {
            const vc = input.varint(), v = readVertices(vc), color = nonessential ? input.int32() : 0;
            const b = attachmentLoader.newBoundingBoxAttachment(skin, name); if (!b) return null;
            b.worldVerticesLength = vc << 1; b.vertices = v.vertices; b.bones = v.bones || null;
            if (nonessential) rgba(b.color, color); return b;
          }
          case "mesh": {
            let path = input.string(); const color = input.int32(), vc = input.varint();
            const uvs = readFloats(vc << 1, 1), tris = readShorts(), v = readVertices(vc), hull = input.varint();
            let edges = null, w = 0, h = 0; if (nonessential) { edges = readShorts(); w = input.float(); h = input.float(); }
            if (path == null) path = name;
            const m = attachmentLoader.newMeshAttachment(skin, name, path); if (!m) return null;
            m.path = path; rgba(m.color, color); m.bones = v.bones || null; m.vertices = v.vertices;
            m.worldVerticesLength = vc << 1; m.triangles = tris; m.regionUVs = uvs; m.updateUVs(); m.hullLength = hull << 1;
            if (nonessential) { m.edges = edges; m.width = w * scale; m.height = h * scale; }
            return m;
          }
          case "linkedmesh": {
            let path = input.string(); const color = input.int32(), skinName = input.string(), parent = input.string(), inheritDeform = input.bool();
            let w = 0, h = 0; if (nonessential) { w = input.float(); h = input.float(); }
            if (path == null) path = name;
            const m = attachmentLoader.newMeshAttachment(skin, name, path); if (!m) return null;
            m.path = path; rgba(m.color, color); m.inheritDeform = inheritDeform;
            if (nonessential) { m.width = w * scale; m.height = h * scale; }
            linkedMeshes.push({ mesh: m, skin: skinName, slotIndex, parent }); return m;
          }
          case "path": {
            const closed = input.bool(), cs = input.bool(), vc = input.varint(), v = readVertices(vc);
            const lengths = spine.Utils.newArray(vc / 3 | 0, 0); for (let i = 0; i < lengths.length; i++) lengths[i] = input.float() * scale;
            const color = nonessential ? input.int32() : 0;
            const p = attachmentLoader.newPathAttachment(skin, name); if (!p) return null;
            p.closed = closed; p.constantSpeed = cs; p.worldVerticesLength = vc << 1; p.vertices = v.vertices; p.bones = v.bones || null;
            p.lengths = lengths; if (nonessential) rgba(p.color, color); return p;
          }
          case "point": {
            const rot = input.float(), x = input.float(), y = input.float(), color = nonessential ? input.int32() : 0;
            const p = attachmentLoader.newPointAttachment(skin, name); if (!p) return null;
            p.x = x * scale; p.y = y * scale; p.rotation = rot; if (nonessential) rgba(p.color, color); return p;
          }
          case "clipping": {
            const end = input.varint(), vc = input.varint(), v = readVertices(vc), color = nonessential ? input.int32() : 0;
            const c = attachmentLoader.newClippingAttachment(skin, name); if (!c) return null;
            c.endSlot = sd.slots[end]; c.worldVerticesLength = vc << 1; c.vertices = v.vertices; c.bones = v.bones || null;
            if (nonessential) rgba(c.color, color); return c;
          }
        }
        return null;
      };
      const readSkin = (skinName) => {
        const slotCount = input.varint(); if (slotCount === 0) return null;
        const skin = new spine.Skin(skinName);
        for (let i = 0; i < slotCount; i++) {
          const slotIndex = input.varint();
          for (let j = 0, m = input.varint(); j < m; j++) {
            const name = input.string(), a = readAttachment(skin, slotIndex, name);
            if (a) skin.addAttachment(slotIndex, name, a);
          }
        }
        return skin;
      };
      const def = readSkin("default"); if (def) { sd.defaultSkin = def; sd.skins.push(def); }
      for (let i = 0, n = input.varint(); i < n; i++) { const nm = input.string(); const s = readSkin(nm); if (s) sd.skins.push(s); else sd.skins.push(new spine.Skin(nm)); }
      for (const lm of linkedMeshes) {
        const skin = lm.skin == null ? sd.defaultSkin : sd.findSkin(lm.skin);
        if (!skin) throw new Error("Skin not found: " + lm.skin);
        const parent = skin.getAttachment(lm.slotIndex, lm.parent);
        if (!parent) throw new Error("Parent mesh not found: " + lm.parent);
        lm.mesh.setParentMesh(parent); lm.mesh.updateUVs();
      }
      for (let i = 0, n = input.varint(); i < n; i++) {
        const d = new spine.EventData(input.string());
        d.intValue = input.varint(false); d.floatValue = input.float(); d.stringValue = input.string();
        if (is37) { d.audioPath = input.string(); if (d.audioPath != null) { d.volume = input.float(); d.balance = input.float(); } }
        sd.events.push(d);
      }
      const readCurve = (i, tl) => {
        const t = input.byte();
        if (t === 1) tl.setStepped(i); else if (t === 2) tl.setCurve(i, input.float(), input.float(), input.float(), input.float());
      };
      const tc1 = new spine.Color(), tc2 = new spine.Color();
      for (let a = 0, an = input.varint(); a < an; a++) {
        const animName = input.string(), tls = []; let dur = 0;
        for (let i = 0, n = input.varint(); i < n; i++) {
          const slotIndex = input.varint();
          for (let j = 0, m = input.varint(); j < m; j++) {
            const type = input.byte(), fc = input.varint();
            if (type === 0) {
              const tl = new spine.AttachmentTimeline(fc); tl.slotIndex = slotIndex;
              for (let f = 0; f < fc; f++) { const t = input.float(); tl.setFrame(f, t, input.string()); dur = Math.max(dur, t); }
              tls.push(tl);
            } else if (type === 1) {
              const tl = new spine.ColorTimeline(fc); tl.slotIndex = slotIndex;
              for (let f = 0; f < fc; f++) { const t = input.float(); rgba(tc1, input.int32()); tl.setFrame(f, t, tc1.r, tc1.g, tc1.b, tc1.a);
                if (f < fc - 1) readCurve(f, tl); dur = Math.max(dur, t); }
              tls.push(tl);
            } else if (type === 2) {
              const tl = new spine.TwoColorTimeline(fc); tl.slotIndex = slotIndex;
              for (let f = 0; f < fc; f++) { const t = input.float(); rgba(tc1, input.int32()); rgb(tc2, input.int32());
                tl.setFrame(f, t, tc1.r, tc1.g, tc1.b, tc1.a, tc2.r, tc2.g, tc2.b); if (f < fc - 1) readCurve(f, tl); dur = Math.max(dur, t); }
              tls.push(tl);
            }
          }
        }
        for (let i = 0, n = input.varint(); i < n; i++) {
          const boneIndex = input.varint();
          for (let j = 0, m = input.varint(); j < m; j++) {
            const type = input.byte(), fc = input.varint();
            if (type === 0) {
              const tl = new spine.RotateTimeline(fc); tl.boneIndex = boneIndex;
              for (let f = 0; f < fc; f++) { const t = input.float(); tl.setFrame(f, t, input.float()); if (f < fc - 1) readCurve(f, tl); dur = Math.max(dur, t); }
              tls.push(tl);
            } else {
              let tl, s = 1;
              if (type === 2) tl = new spine.ScaleTimeline(fc); else if (type === 3) tl = new spine.ShearTimeline(fc); else { tl = new spine.TranslateTimeline(fc); s = scale; }
              tl.boneIndex = boneIndex;
              for (let f = 0; f < fc; f++) { const t = input.float(); tl.setFrame(f, t, input.float() * s, input.float() * s); if (f < fc - 1) readCurve(f, tl); dur = Math.max(dur, t); }
              tls.push(tl);
            }
          }
        }
        for (let i = 0, n = input.varint(); i < n; i++) {
          const index = input.varint(), fc = input.varint(), tl = new spine.IkConstraintTimeline(fc); tl.ikConstraintIndex = index;
          for (let f = 0; f < fc; f++) {
            const t = input.float();
            if (is37) tl.setFrame(f, t, input.float(), input.byte(), input.bool(), input.bool()); else tl.setFrame(f, t, input.float(), input.byte());
            if (f < fc - 1) readCurve(f, tl); dur = Math.max(dur, t);
          }
          tls.push(tl);
        }
        for (let i = 0, n = input.varint(); i < n; i++) {
          const index = input.varint(), fc = input.varint(), tl = new spine.TransformConstraintTimeline(fc); tl.transformConstraintIndex = index;
          for (let f = 0; f < fc; f++) { const t = input.float(); tl.setFrame(f, t, input.float(), input.float(), input.float(), input.float());
            if (f < fc - 1) readCurve(f, tl); dur = Math.max(dur, t); }
          tls.push(tl);
        }
        for (let i = 0, n = input.varint(); i < n; i++) {
          const index = input.varint(), data = sd.pathConstraints[index];
          for (let j = 0, m = input.varint(); j < m; j++) {
            const type = input.byte(), fc = input.varint();
            if (type === 0 || type === 1) {
              let tl, s = 1;
              if (type === 1) { tl = new spine.PathConstraintSpacingTimeline(fc); if (data.spacingMode === 0 || data.spacingMode === 1) s = scale; }
              else { tl = new spine.PathConstraintPositionTimeline(fc); if (data.positionMode === 0) s = scale; }
              tl.pathConstraintIndex = index;
              for (let f = 0; f < fc; f++) { const t = input.float(); tl.setFrame(f, t, input.float() * s); if (f < fc - 1) readCurve(f, tl); dur = Math.max(dur, t); }
              tls.push(tl);
            } else if (type === 2) {
              const tl = new spine.PathConstraintMixTimeline(fc); tl.pathConstraintIndex = index;
              for (let f = 0; f < fc; f++) { const t = input.float(); tl.setFrame(f, t, input.float(), input.float()); if (f < fc - 1) readCurve(f, tl); dur = Math.max(dur, t); }
              tls.push(tl);
            }
          }
        }
        for (let i = 0, n = input.varint(); i < n; i++) {
          const skin = sd.skins[input.varint()];
          for (let j = 0, m = input.varint(); j < m; j++) {
            const slotIndex = input.varint();
            for (let k = 0, kn = input.varint(); k < kn; k++) {
              const att = skin.getAttachment(slotIndex, input.string());
              const weighted = att.bones != null, verts = att.vertices, dl = weighted ? verts.length / 3 * 2 : verts.length;
              const fc = input.varint(), tl = new spine.DeformTimeline(fc); tl.slotIndex = slotIndex; tl.attachment = att;
              for (let f = 0; f < fc; f++) {
                const t = input.float(); let deform; let end = input.varint();
                if (end === 0) deform = weighted ? spine.Utils.newFloatArray(dl) : verts;
                else {
                  deform = spine.Utils.newFloatArray(dl); const start = input.varint(); end += start;
                  for (let v = start; v < end; v++) deform[v] = input.float() * scale;
                  if (!weighted) for (let v = 0; v < deform.length; v++) deform[v] += verts[v];
                }
                tl.setFrame(f, t, deform); if (f < fc - 1) readCurve(f, tl); dur = Math.max(dur, t);
              }
              tls.push(tl);
            }
          }
        }
        const doc = input.varint();
        if (doc > 0) {
          const tl = new spine.DrawOrderTimeline(doc), sc = sd.slots.length;
          for (let i = 0; i < doc; i++) {
            const t = input.float(), oc = input.varint(), order = spine.Utils.newArray(sc, -1), unchanged = spine.Utils.newArray(sc - oc, 0);
            let oi = 0, ui = 0;
            for (let j = 0; j < oc; j++) { const si = input.varint(); while (oi !== si) unchanged[ui++] = oi++; order[oi + input.varint()] = oi++; }
            while (oi < sc) unchanged[ui++] = oi++;
            for (let j = sc - 1; j >= 0; j--) if (order[j] === -1) order[j] = unchanged[--ui];
            tl.setFrame(i, t, order); dur = Math.max(dur, t);
          }
          tls.push(tl);
        }
        const ec = input.varint();
        if (ec > 0) {
          const tl = new spine.EventTimeline(ec);
          for (let i = 0; i < ec; i++) {
            const t = input.float(), ed = sd.events[input.varint()], e = new spine.Event(t, ed);
            e.intValue = input.varint(false); e.floatValue = input.float(); e.stringValue = input.bool() ? input.string() : ed.stringValue;
            if (is37 && ed.audioPath != null) { e.volume = input.float(); e.balance = input.float(); }
            tl.setFrame(i, e); dur = Math.max(dur, t);
          }
          tls.push(tl);
        }
        sd.animations.push(new spine.Animation(animName, tls, dur));
      }
      return sd;
    }
  };
}
