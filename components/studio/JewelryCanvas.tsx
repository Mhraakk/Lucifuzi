"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  GOLD_OPTIONS,
  STUDIO_GEMS,
  type GemId,
  type GoldKarat,
  type StudioFormId,
  type StudioTool,
} from "@/lib/studio/catalog";

type Props = {
  form: StudioFormId;
  karat: GoldKarat;
  tool: StudioTool;
  gem: GemId;
  presenting: boolean;
  pieceTitle: string;
  resetTick?: number;
  captureTick?: number;
  onSculptFeedback?: (msg: string) => void;
  onCapture?: (dataUrl: string | null) => void;
};

function goldMaterial(karat: GoldKarat): THREE.MeshStandardMaterial {
  const opt = GOLD_OPTIONS.find((g) => g.karat === karat) ?? GOLD_OPTIONS[0]!;
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(opt.hex),
    metalness: opt.metalness,
    roughness: opt.roughness,
    envMapIntensity: 1.2,
  });
}

function gemMaterial(gemId: GemId): THREE.MeshPhysicalMaterial {
  const gem = STUDIO_GEMS.find((g) => g.id === gemId) ?? STUDIO_GEMS[0]!;
  const isPearl = gemId === "pearl";
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(gem.color),
    metalness: isPearl ? 0.05 : 0.15,
    roughness: isPearl ? 0.35 : 0.08,
    transmission: isPearl ? 0.15 : 0.55,
    thickness: 0.6,
    ior: 2.4,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    transparent: true,
    opacity: isPearl ? 0.95 : 0.92,
  });
}

function buildForm(
  form: StudioFormId,
  mat: THREE.MeshStandardMaterial
): THREE.Group {
  const group = new THREE.Group();
  group.name = "piece";

  if (form === "raw") {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 4), mat);
    mesh.name = "sculptable";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return group;
  }

  if (form === "ring") {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.18, 32, 96),
      mat
    );
    band.name = "sculptable";
    band.rotation.x = Math.PI / 2;
    band.castShadow = true;
    group.add(band);
    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 0.12, 24),
      mat
    );
    seat.position.set(0, 1.15, 0);
    seat.name = "sculptable";
    group.add(seat);
    return group;
  }

  if (form === "bracelet") {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.14, 28, 100),
      mat
    );
    band.name = "sculptable";
    band.rotation.x = Math.PI / 2.2;
    band.castShadow = true;
    group.add(band);
    return group;
  }

  if (form === "chain") {
    for (let i = 0; i < 9; i++) {
      const link = new THREE.Mesh(
        new THREE.TorusGeometry(0.28, 0.07, 16, 40),
        mat
      );
      link.position.set((i - 4) * 0.38, Math.sin(i * 0.7) * 0.08, 0);
      link.rotation.y = i % 2 === 0 ? 0 : Math.PI / 2;
      link.rotation.z = i % 2 === 0 ? Math.PI / 2 : 0;
      link.name = "sculptable";
      link.castShadow = true;
      group.add(link);
    }
    return group;
  }

  if (form === "earring") {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.55, 48, 48), mat);
    drop.name = "sculptable";
    drop.scale.set(0.85, 1.25, 0.85);
    drop.position.y = -0.35;
    drop.castShadow = true;
    group.add(drop);
    const hook = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.05, 12, 36, Math.PI * 1.3),
      mat
    );
    hook.position.set(0, 0.75, 0);
    hook.rotation.z = Math.PI / 2;
    hook.name = "sculptable";
    group.add(hook);
    return group;
  }

  if (form === "pendant") {
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 0.12, 48),
      mat
    );
    plate.name = "sculptable";
    plate.rotation.x = Math.PI / 2;
    plate.castShadow = true;
    group.add(plate);
    const bail = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.05, 12, 28),
      mat
    );
    bail.position.y = 0.95;
    bail.name = "sculptable";
    group.add(bail);
    return group;
  }

  if (form === "bar") {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.55, 1.1, 8, 4, 6),
      mat
    );
    bar.name = "sculptable";
    bar.castShadow = true;
    group.add(bar);
    return group;
  }

  const plaque = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 1.8, 0.14, 10, 10, 2),
    mat
  );
  plaque.name = "sculptable";
  plaque.castShadow = true;
  group.add(plaque);
  const rimMesh = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.06, 12, 64),
    mat
  );
  rimMesh.position.z = 0.08;
  rimMesh.name = "sculptable";
  group.add(rimMesh);
  return group;
}

function collectSculptables(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.name === "sculptable") out.push(obj);
  });
  return out;
}

export function JewelryCanvas({
  form,
  karat,
  tool,
  gem,
  presenting,
  pieceTitle,
  resetTick = 0,
  captureTick = 0,
  onSculptFeedback,
  onCapture,
}: Props) {
    const mountRef = useRef<HTMLDivElement>(null);
    const stateRef = useRef({ form, karat, tool, gem, presenting, pieceTitle });
    stateRef.current = { form, karat, tool, gem, presenting, pieceTitle };
    const onCaptureRef = useRef(onCapture);
    onCaptureRef.current = onCapture;

    const apiRef = useRef<{
      rebuild: () => void;
      setPresent: (on: boolean) => void;
      capture: () => string | null;
      dispose: () => void;
    } | null>(null);

    useEffect(() => {
      const mount = mountRef.current;
      if (!mount) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0e0c0a);

      const camera = new THREE.PerspectiveCamera(
        42,
        mount.clientWidth / Math.max(mount.clientHeight, 1),
        0.1,
        100
      );
      camera.position.set(0, 1.2, 5.2);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      mount.appendChild(renderer.domElement);

      const hemi = new THREE.HemisphereLight(0xfff2d9, 0x1a1410, 0.85);
      scene.add(hemi);
      const key = new THREE.DirectionalLight(0xffe6b8, 1.55);
      key.position.set(4, 7, 3);
      key.castShadow = true;
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xb8c8ff, 0.45);
      fill.position.set(-4, 2, -2);
      scene.add(fill);
      const rimLight = new THREE.PointLight(0xffddaa, 0.6, 20);
      rimLight.position.set(0, -2, 4);
      scene.add(rimLight);

      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(6, 64),
        new THREE.MeshStandardMaterial({
          color: 0x1a1612,
          metalness: 0.4,
          roughness: 0.75,
        })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -1.65;
      floor.receiveShadow = true;
      scene.add(floor);

      const stageRing = new THREE.Mesh(
        new THREE.TorusGeometry(2.4, 0.02, 8, 80),
        new THREE.MeshBasicMaterial({
          color: 0xc4a35a,
          transparent: true,
          opacity: 0.35,
        })
      );
      stageRing.rotation.x = Math.PI / 2;
      stageRing.position.y = -1.62;
      scene.add(stageRing);

      let pieceRoot = new THREE.Group();
      scene.add(pieceRoot);
      const gemsRoot = new THREE.Group();
      scene.add(gemsRoot);

      let goldMat = goldMaterial(stateRef.current.karat);
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();

      const clearGems = () => {
        while (gemsRoot.children.length) {
          const child = gemsRoot.children[0]!;
          gemsRoot.remove(child);
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        }
      };

      const rebuild = () => {
        scene.remove(pieceRoot);
        pieceRoot.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
        goldMat.dispose();
        goldMat = goldMaterial(stateRef.current.karat);
        pieceRoot = buildForm(stateRef.current.form, goldMat);
        scene.add(pieceRoot);
        clearGems();
      };
      rebuild();

      let rotY = 0.35;
      let rotX = -0.25;
      let autoSpin = false;
      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      let pinchStart = 0;
      let camDist = 5.2;

      const applyOrbit = () => {
        camera.position.x = Math.sin(rotY) * Math.cos(rotX) * camDist;
        camera.position.y = Math.sin(rotX) * camDist * 0.65 + 0.4;
        camera.position.z = Math.cos(rotY) * Math.cos(rotX) * camDist;
        camera.lookAt(0, 0.1, 0);
      };
      applyOrbit();

      const setPointerFromEvent = (clientX: number, clientY: number) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      };

      const sculptBrush = (
        clientX: number,
        clientY: number,
        mode: "push" | "smooth"
      ) => {
        setPointerFromEvent(clientX, clientY);
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(
          collectSculptables(pieceRoot),
          true
        );
        if (!hits.length) return;
        const hit = hits[0]!;
        const mesh = hit.object as THREE.Mesh;
        const geo = mesh.geometry;
        const pos = geo.getAttribute("position") as THREE.BufferAttribute;
        const localHit = mesh.worldToLocal(hit.point.clone());
        const radius = mode === "smooth" ? 0.5 : 0.36;
        const strength = mode === "smooth" ? 0.035 : 0.055;
        const worldNormal =
          hit.face?.normal
            ?.clone()
            .transformDirection(mesh.matrixWorld)
            .normalize() ?? new THREE.Vector3(0, 1, 0);
        const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
        const localNormal = worldNormal
          .clone()
          .transformDirection(inv)
          .normalize();

        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          const d = v.distanceTo(localHit);
          if (d > radius) continue;
          const w = Math.cos((d / radius) * (Math.PI / 2));
          if (mode === "smooth") {
            v.lerp(localHit, strength * w * 0.35);
          } else {
            v.addScaledVector(localNormal, strength * w * w);
          }
          pos.setXYZ(i, v.x, v.y, v.z);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        onSculptFeedback?.(
          mode === "smooth" ? "سطح صاف‌تر شد" : "طلا فرم گرفت"
        );
      };

      const placeGemAt = (clientX: number, clientY: number) => {
        setPointerFromEvent(clientX, clientY);
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(
          collectSculptables(pieceRoot),
          true
        );
        if (!hits.length) {
          onSculptFeedback?.("روی سطح طلا ضربه بزنید");
          return;
        }
        const hit = hits[0]!;
        const gemId = stateRef.current.gem;
        const mat = gemMaterial(gemId);
        const size = gemId === "pearl" ? 0.22 : 0.18;
        const geo =
          gemId === "pearl"
            ? new THREE.SphereGeometry(size, 24, 24)
            : new THREE.OctahedronGeometry(size, 0);
        const mesh = new THREE.Mesh(geo, mat);
        const n =
          hit.face?.normal
            ?.clone()
            .transformDirection(hit.object.matrixWorld)
            .normalize() ?? new THREE.Vector3(0, 1, 0);
        mesh.position.copy(hit.point).addScaledVector(n, size * 0.85);
        mesh.lookAt(hit.point.clone().add(n));
        mesh.castShadow = true;
        gemsRoot.add(mesh);
        const label =
          STUDIO_GEMS.find((g) => g.id === gemId)?.titleFa ?? "نگین";
        onSculptFeedback?.(`${label} نصب شد`);
      };

      const el = renderer.domElement;
      el.style.touchAction = "none";
      el.style.width = "100%";
      el.style.height = "100%";
      el.style.display = "block";
      el.style.cursor = "grab";

      const onPointerDown = (e: PointerEvent) => {
        if (stateRef.current.presenting) return;
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        el.setPointerCapture(e.pointerId);
        const t = stateRef.current.tool;
        if (t === "place-gem") {
          placeGemAt(e.clientX, e.clientY);
          dragging = false;
          return;
        }
        if (t === "sculpt") sculptBrush(e.clientX, e.clientY, "push");
        if (t === "smooth") sculptBrush(e.clientX, e.clientY, "smooth");
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!dragging || stateRef.current.presenting) return;
        const t = stateRef.current.tool;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        if (t === "orbit") {
          rotY += dx * 0.008;
          rotX = Math.max(-1.1, Math.min(1.1, rotX + dy * 0.006));
          applyOrbit();
        } else if (t === "sculpt") {
          sculptBrush(e.clientX, e.clientY, "push");
        } else if (t === "smooth") {
          sculptBrush(e.clientX, e.clientY, "smooth");
        }
      };

      const onPointerUp = (e: PointerEvent) => {
        dragging = false;
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        camDist = Math.max(3.2, Math.min(9, camDist + e.deltaY * 0.01));
        applyOrbit();
      };

      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          const a = e.touches[0]!;
          const b = e.touches[1]!;
          pinchStart = Math.hypot(
            a.clientX - b.clientX,
            a.clientY - b.clientY
          );
        }
      };
      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 2 && pinchStart > 0) {
          const a = e.touches[0]!;
          const b = e.touches[1]!;
          const dist = Math.hypot(
            a.clientX - b.clientX,
            a.clientY - b.clientY
          );
          camDist = Math.max(
            3.2,
            Math.min(9, camDist + (pinchStart - dist) * 0.015)
          );
          pinchStart = dist;
          applyOrbit();
        }
      };

      el.addEventListener("pointerdown", onPointerDown);
      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerup", onPointerUp);
      el.addEventListener("pointercancel", onPointerUp);
      el.addEventListener("wheel", onWheel, { passive: false });
      el.addEventListener("touchstart", onTouchStart, { passive: true });
      el.addEventListener("touchmove", onTouchMove, { passive: true });

      let raf = 0;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (autoSpin || stateRef.current.presenting) {
          rotY += 0.006;
          applyOrbit();
        }
        pieceRoot.rotation.y = Math.sin(performance.now() * 0.0004) * 0.04;
        renderer.render(scene, camera);
      };
      tick();

      const onResize = () => {
        const w = mount.clientWidth;
        const h = Math.max(mount.clientHeight, 1);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      const ro = new ResizeObserver(onResize);
      ro.observe(mount);

      apiRef.current = {
        rebuild,
        setPresent: (on) => {
          autoSpin = on;
          scene.background = new THREE.Color(on ? 0x12100e : 0x0e0c0a);
        },
        capture: () => {
          try {
            return renderer.domElement.toDataURL("image/png");
          } catch {
            return null;
          }
        },
        dispose: () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          el.removeEventListener("pointerdown", onPointerDown);
          el.removeEventListener("pointermove", onPointerMove);
          el.removeEventListener("pointerup", onPointerUp);
          el.removeEventListener("pointercancel", onPointerUp);
          el.removeEventListener("wheel", onWheel);
          el.removeEventListener("touchstart", onTouchStart);
          el.removeEventListener("touchmove", onTouchMove);
          renderer.dispose();
          if (renderer.domElement.parentElement === mount) {
            mount.removeChild(renderer.domElement);
          }
        },
      };

      return () => {
        apiRef.current?.dispose();
        apiRef.current = null;
      };
    }, [onSculptFeedback]);

    useEffect(() => {
      apiRef.current?.rebuild();
    }, [form, karat]);

    useEffect(() => {
      if (resetTick > 0) apiRef.current?.rebuild();
    }, [resetTick]);

    useEffect(() => {
      if (captureTick > 0) {
        onCaptureRef.current?.(apiRef.current?.capture() ?? null);
      }
    }, [captureTick]);

    useEffect(() => {
      apiRef.current?.setPresent(presenting);
    }, [presenting]);

    return (
      <div
        ref={mountRef}
        className="jx-studio-canvas"
        role="img"
        aria-label={pieceTitle || "بوم سه‌بعدی جواهر"}
      />
    );
}
