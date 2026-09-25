"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { RoleEnvironment } from "@/lib/trials/catalog";

type Props = {
  scene: RoleEnvironment["scene3d"];
  accent: string;
  /** Highlight inspect mode for 3d_inspect steps */
  inspect?: boolean;
  className?: string;
  /** Reports cumulative absolute orbit degrees for instrument validation */
  onOrbitDegrees?: (deg: number) => void;
};

function makeGoldMat(accent: string) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(accent),
    metalness: 0.92,
    roughness: 0.22,
    envMapIntensity: 1.1,
  });
}

function makeStoneMat() {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color("#2a241c"),
    metalness: 0.15,
    roughness: 0.85,
  });
}

function buildScene(
  kind: RoleEnvironment["scene3d"],
  accent: string
): THREE.Group {
  const root = new THREE.Group();
  const gold = makeGoldMat(accent);
  const stone = makeStoneMat();
  const glass = new THREE.MeshPhysicalMaterial({
    color: "#e8f0f8",
    metalness: 0.05,
    roughness: 0.05,
    transmission: 0.7,
    thickness: 0.4,
    transparent: true,
    opacity: 0.85,
  });

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 48),
    new THREE.MeshStandardMaterial({
      color: "#1a1612",
      metalness: 0.3,
      roughness: 0.7,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.85;
  floor.receiveShadow = true;
  root.add(floor);

  if (kind === "counter") {
    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.18, 1.2),
      stone
    );
    counter.position.y = -0.4;
    counter.castShadow = true;
    root.add(counter);
    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.06, 0.7),
      new THREE.MeshStandardMaterial({
        color: "#3d1f2a",
        roughness: 0.9,
        metalness: 0.05,
      })
    );
    tray.position.set(0, -0.25, 0.1);
    root.add(tray);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.06, 20, 48),
      gold
    );
    ring.rotation.x = Math.PI / 2.4;
    ring.position.set(0, -0.12, 0.1);
    ring.castShadow = true;
    ring.name = "hero";
    root.add(ring);
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.1, 0),
      new THREE.MeshPhysicalMaterial({
        color: "#7ec8e3",
        metalness: 0.1,
        roughness: 0.08,
        transmission: 0.5,
        thickness: 0.3,
      })
    );
    gem.position.set(0, 0.08, 0.1);
    root.add(gem);
  } else if (kind === "safe") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.5, 1.1), stone);
    body.castShadow = true;
    root.add(body);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 1.25, 0.08),
      new THREE.MeshStandardMaterial({
        color: "#4a4034",
        metalness: 0.55,
        roughness: 0.4,
      })
    );
    door.position.set(0, 0, 0.58);
    root.add(door);
    const dial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.08, 32),
      gold
    );
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0, 0.1, 0.64);
    dial.name = "hero";
    root.add(dial);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.08, 0.08),
      gold
    );
    bar.position.set(0.35, -0.15, 0.64);
    root.add(bar);
  } else if (kind === "bench") {
    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.14, 1.3),
      new THREE.MeshStandardMaterial({
        color: "#5c4030",
        roughness: 0.75,
        metalness: 0.1,
      })
    );
    bench.position.y = -0.35;
    root.add(bench);
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.35, 0.4),
      new THREE.MeshStandardMaterial({
        color: "#d4c4a8",
        roughness: 0.9,
      })
    );
    block.position.set(-0.55, -0.1, 0.1);
    root.add(block);
    const piece = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.07, 16, 40),
      gold
    );
    piece.rotation.x = Math.PI / 2;
    piece.position.set(0.35, -0.05, 0);
    piece.name = "hero";
    piece.castShadow = true;
    root.add(piece);
    const file = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.04, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: "#888", metalness: 0.7 })
    );
    file.rotation.z = Math.PI / 2.5;
    file.position.set(0.7, -0.2, 0.35);
    root.add(file);
  } else if (kind === "furnace") {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.05, 0.35, 32),
      stone
    );
    base.position.y = -0.55;
    root.add(base);
    const chamber = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.75, 1.1, 32),
      new THREE.MeshStandardMaterial({
        color: "#3a322c",
        metalness: 0.4,
        roughness: 0.55,
      })
    );
    chamber.position.y = 0.15;
    root.add(chamber);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 24, 24),
      new THREE.MeshStandardMaterial({
        color: "#ff6a2a",
        emissive: "#ff4500",
        emissiveIntensity: 0.85,
        metalness: 0.2,
        roughness: 0.4,
      })
    );
    glow.position.y = 0.2;
    glow.name = "hero";
    root.add(glow);
    const crucible = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.22, 0.35, 24),
      new THREE.MeshStandardMaterial({
        color: "#2a2a2a",
        metalness: 0.5,
        roughness: 0.5,
      })
    );
    crucible.position.set(1.1, -0.35, 0.4);
    root.add(crucible);
    const melt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.08, 24),
      gold
    );
    melt.position.set(1.1, -0.18, 0.4);
    root.add(melt);
  } else if (kind === "studio") {
    const form = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.05, -0.7),
          new THREE.Vector2(0.35, -0.4),
          new THREE.Vector2(0.45, 0),
          new THREE.Vector2(0.3, 0.45),
          new THREE.Vector2(0.12, 0.75),
        ],
        48
      ),
      gold
    );
    form.name = "hero";
    form.castShadow = true;
    root.add(form);
    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.02, 8, 64),
      new THREE.MeshStandardMaterial({
        color: accent,
        metalness: 0.8,
        roughness: 0.3,
        transparent: true,
        opacity: 0.55,
      })
    );
    orbit.rotation.x = Math.PI / 2.8;
    root.add(orbit);
  } else if (kind === "ticker") {
    for (let i = 0; i < 3; i++) {
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1, 0.7),
        new THREE.MeshStandardMaterial({
          color: i === 1 ? "#1e3a2f" : "#1a2230",
          metalness: 0.2,
          roughness: 0.6,
          emissive: i === 1 ? "#0a3d2a" : "#0a1520",
          emissiveIntensity: 0.4,
        })
      );
      panel.position.set((i - 1) * 1.15, 0.2 + (i === 1 ? 0.15 : 0), -0.2 * i);
      panel.rotation.y = (i - 1) * 0.2;
      root.add(panel);
    }
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.9, 0.08),
      gold
    );
    bar.position.set(0.15, 0.15, 0.35);
    bar.name = "hero";
    root.add(bar);
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.06, 48),
      gold
    );
    coin.rotation.x = Math.PI / 2.2;
    coin.position.set(-0.5, -0.35, 0.5);
    root.add(coin);
  } else if (kind === "assay") {
    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.12, 1.2),
      stone
    );
    desk.position.y = -0.4;
    root.add(desk);
    const scaleBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.4, 0.15, 24),
      new THREE.MeshStandardMaterial({ color: "#333", metalness: 0.6 })
    );
    scaleBase.position.set(-0.5, -0.25, 0.1);
    root.add(scaleBase);
    const pan = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.25, 0.04, 24),
      new THREE.MeshStandardMaterial({ color: "#aaa", metalness: 0.8 })
    );
    pan.position.set(-0.5, -0.05, 0.1);
    root.add(pan);
    const scrap = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.14, 0),
      gold
    );
    scrap.position.set(-0.5, 0.08, 0.1);
    scrap.name = "hero";
    root.add(scrap);
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.18, 0.25),
      new THREE.MeshStandardMaterial({
        color: "#2c3e50",
        metalness: 0.5,
        roughness: 0.4,
      })
    );
    gun.position.set(0.55, -0.2, 0.15);
    root.add(gun);
  } else {
    /* loupe / qc */
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.95, 0.08, 48),
      new THREE.MeshStandardMaterial({
        color: "#ece6dc",
        roughness: 0.55,
        metalness: 0.1,
      })
    );
    plate.position.y = -0.45;
    root.add(plate);
    const piece = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.08, 20, 48),
      gold
    );
    piece.rotation.x = Math.PI / 2.5;
    piece.position.y = -0.2;
    piece.name = "hero";
    piece.castShadow = true;
    root.add(piece);
    const lens = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.06, 12, 48),
      new THREE.MeshStandardMaterial({
        color: "#c9a45c",
        metalness: 0.85,
        roughness: 0.25,
      })
    );
    lens.position.set(0.55, 0.35, 0.55);
    lens.rotation.y = -0.4;
    root.add(lens);
    const glassDisk = new THREE.Mesh(
      new THREE.CircleGeometry(0.48, 32),
      glass
    );
    glassDisk.position.copy(lens.position);
    glassDisk.rotation.copy(lens.rotation);
    root.add(glassDisk);
  }

  return root;
}

export function TrialScene3D({
  scene,
  accent,
  inspect = false,
  className,
  onOrbitDegrees,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const orbitCb = useRef(onOrbitDegrees);
  orbitCb.current = onOrbitDegrees;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth || 320;
    const h = mount.clientHeight || 240;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const threeScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 40);
    camera.position.set(0, 1.1, 3.4);
    camera.lookAt(0, 0, 0);

    const hemi = new THREE.HemisphereLight(0xfff4e0, 0x1a1510, 0.85);
    threeScene.add(hemi);
    const key = new THREE.DirectionalLight(0xffe6b8, 1.35);
    key.position.set(3, 5, 2);
    key.castShadow = true;
    threeScene.add(key);
    const rim = new THREE.DirectionalLight(0x88aacc, 0.45);
    rim.position.set(-3, 2, -2);
    threeScene.add(rim);

    const content = buildScene(scene, accent);
    threeScene.add(content);

    let dragging = false;
    let prevX = 0;
    let rotY = 0.35;
    let rotX = 0.15;
    let orbitAccum = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      prevX = e.clientX;
      mount.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - prevX;
      prevX = e.clientX;
      rotY += dx * 0.01;
      orbitAccum += Math.abs(dx) * (180 / Math.PI) * 0.01;
      orbitCb.current?.(orbitAccum);
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      try {
        mount.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    mount.addEventListener("pointerdown", onDown);
    mount.addEventListener("pointermove", onMove);
    mount.addEventListener("pointerup", onUp);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = performance.now() * 0.001;
      content.rotation.y = rotY + (inspect ? Math.sin(t * 0.4) * 0.15 : t * 0.12);
      content.rotation.x = rotX + (inspect ? Math.sin(t * 0.55) * 0.08 : 0);
      const hero = content.getObjectByName("hero");
      if (hero && inspect) {
        hero.scale.setScalar(1 + Math.sin(t * 2) * 0.04);
      }
      renderer.render(threeScene, camera);
    };
    tick();

    const ro = new ResizeObserver(() => {
      const nw = mount.clientWidth;
      const nh = mount.clientHeight;
      if (!nw || !nh) return;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mount.removeEventListener("pointerdown", onDown);
      mount.removeEventListener("pointermove", onMove);
      mount.removeEventListener("pointerup", onUp);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      content.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          for (const m of mats) m.dispose();
        }
      });
    };
  }, [scene, accent, inspect]);

  return (
    <div
      ref={mountRef}
      className={className ?? "trial-scene3d"}
      role="img"
      aria-label="محیط سه‌بعدی آزمایش نقش"
    />
  );
}
