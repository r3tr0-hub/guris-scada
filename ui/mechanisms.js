/* Drawing code from SCADA_Mockup. These are explanatory diagrams, never PLC position feedback. */
window.SCADA_MECHANISMS = (() => {
  'use strict';

  return {
    create(root) {
      const app = root.querySelector('.sc-app');
      const t = window.SCADA_I18N?.t || (s => s);
      const model = {
        scenario: 'offline',
        takeoffPosition: 113.5,
        airStartAngle: 5,
        airStopAngle: 75,
        tensionSet: 0,
        ejectSpeedEnabled: false,
        ejectSpeed: 270,
        ejectEnabled: false,
        ejectPosition: 287.5,
        seamEnabled: false
      };
      const rollerColors = {};
      function readPalette() {
        const rollerStyle = getComputedStyle(app);
        Object.assign(rollerColors, {
          face: rollerStyle.getPropertyValue('--sc-panel-top').trim(),
          rim: rollerStyle.getPropertyValue('--sc-muted').trim(),
          belt: rollerStyle.getPropertyValue('--sc-cyan').trim(),
          marks: rollerStyle.getPropertyValue('--sc-text').trim(),
          guide: rollerStyle.getPropertyValue('--sc-line').trim(),
          warm: rollerStyle.getPropertyValue('--sc-amber').trim(),
          lowerBelt: rollerStyle.getPropertyValue('--sc-green').trim(),
          roller: rollerStyle.getPropertyValue('--sc-red').trim(),
          packet: rollerStyle.getPropertyValue('--sc-field-top').trim()
        });
      }
      readPalette();
      const rollerCanvases = Array.from(root.querySelectorAll('[data-roller-canvas],[data-mechanism-canvas]'), canvas => {
        const width = Number(canvas.dataset.rollerWidth),
          height = Number(canvas.dataset.rollerHeight);
        // Keep the logical aspect ratio when a CSS height is automatic. Changing
        // the raster dimensions must not feed back into the layout through the
        // rounded intrinsic size of the canvas.
        if (getComputedStyle(canvas).aspectRatio === 'auto') {
          canvas.style.aspectRatio = `${width} / ${height}`;
        }
        let context = null;
        try {
          context = canvas.getContext('2d');
        } catch {}
        return {
          canvas,
          context,
          width,
          height,
          kind: canvas.dataset.mechanism || 'takeoff',
          visible: !canvas.closest('[hidden],[data-equipment="unknown"]')
        };
      }).filter(x => x.context);
      let rollerPlaying = false,
        rollerDisposed = false,
        rollerElapsed = 0,
        rollerLastFrame = null,
        rollerFrame = null,
        resizeFrame = null,
        resizeObserver = null,
        densityQuery = null,
        lastPaint = 0,
        seamPose = 0,
        seamTransition = null;
      function fitBackingStore(item) {
        const rect = item.canvas.getBoundingClientRect();
        if (!item.visible || rect.width <= 0 || rect.height <= 0) return false;
        // The rect includes the 1024x600 application's CSS transform. DPR also
        // changes with Windows display scaling, browser zoom and monitor moves.
        const density = window.devicePixelRatio || 1;
        const zoom = window.visualViewport?.scale || 1;
        let width = Math.max(1, Math.ceil(rect.width * density * zoom));
        let height = Math.max(1, Math.ceil(rect.height * density * zoom));
        // Bound exceptional zoom/window sizes on older operator PCs. Normal
        // Full HD/4K menu icons use one raster pixel per physical screen pixel.
        const limit = Math.min(1, 8192 / width, 8192 / height,
          Math.sqrt(8388608 / (width * height)));
        if (limit < 1) {
          width = Math.max(1, Math.floor(width * limit));
          height = Math.max(1, Math.floor(height * limit));
        }
        if (item.canvas.width === width && item.canvas.height === height) return false;
        item.canvas.width = width;
        item.canvas.height = height;
        return true;
      }
      function resize() {
        if (rollerDisposed || document.hidden) return;
        let changed = false;
        for (const item of rollerCanvases) {
          if (item.visible && fitBackingStore(item)) changed = true;
        }
        if (changed) drawRollers(rollerElapsed);
      }
      function queueResize() {
        if (rollerDisposed || resizeFrame !== null) return;
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = null;
          resize();
        });
      }
      function detachDensityQuery() {
        if (densityQuery?.removeEventListener) densityQuery.removeEventListener('change', densityChanged);
        else densityQuery?.removeListener(densityChanged);
      }
      function watchDensity() {
        detachDensityQuery();
        densityQuery = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`) || null;
        if (densityQuery?.addEventListener) densityQuery.addEventListener('change', densityChanged);
        else densityQuery?.addListener(densityChanged);
      }
      function densityChanged() {
        watchDensity();
        queueResize();
      }
      function smoothStep(value) {
        const t = Math.max(0, Math.min(1, value));
        return t * t * (3 - 2 * t);
      }
      function drawMechanismWheel(ctx, x, y, radius, phase, coiled = false) {
        ctx.save();
        ctx.translate(x, y);
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fillStyle = rollerColors.face;
        ctx.fill();
        ctx.strokeStyle = coiled ? rollerColors.belt : rollerColors.rim;
        ctx.lineWidth = coiled ? 2 : 1.6;
        ctx.stroke();
        ctx.rotate(phase);
        ctx.strokeStyle = rollerColors.rim;
        ctx.lineWidth = 1.2;
        if (coiled) {
          for (const [r, start] of [[radius * 0.75, -0.6], [radius * 0.5, 0.8]]) {
            ctx.beginPath();
            ctx.arc(0, 0, r, start, start + Math.PI * 1.5);
            ctx.stroke();
          }
        } else {
          for (let spoke = 0; spoke < 3; spoke += 1) {
            const angle = spoke * Math.PI * 2 / 3;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * radius * 0.28, Math.sin(angle) * radius * 0.28);
            ctx.lineTo(Math.cos(angle) * radius * 0.7, Math.sin(angle) * radius * 0.7);
            ctx.stroke();
          }
        }
        ctx.beginPath();
        ctx.moveTo(radius * 0.35, 0);
        ctx.lineTo(radius * 0.83, 0);
        ctx.strokeStyle = rollerColors.belt;
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1.8, radius * 0.17), 0, Math.PI * 2);
        ctx.fillStyle = rollerColors.belt;
        ctx.fill();
        ctx.restore();
      }
      function airFlowPoint(progress) {
        if (progress >= 0.55) return {
          x: 92 - (progress - 0.55) / 0.45 * 70,
          y: 59,
          angle: Math.PI
        };
        const t = progress / 0.55;
        const u = 1 - t;
        const x = u * u * u * 142 + 3 * u * u * t * 142 + 3 * u * t * t * 123 + t * t * t * 92;
        const y = u * u * u * 11 + 3 * u * u * t * 41 + 3 * u * t * t * 59 + t * t * t * 59;
        const dx = 6 * u * t * (123 - 142) + 3 * t * t * (92 - 123);
        const dy = 3 * u * u * 30 + 6 * u * t * 18;
        return {
          x,
          y,
          angle: Math.atan2(dy, dx)
        };
      }
      function processText(selector, value) {
        const element = root.querySelector(selector);
        if (element && element.textContent !== value) element.textContent = value;
      }
      function takeoffCycle(seconds) {
        const cycle = seconds / 3.2;
        const phase = cycle % 1;
        // Общий цикл для приёмного вала и трубок: подача, резка, задержка, захват, выдача.
        const feedProgress = smoothStep(phase / 0.28);
        const movement = smoothStep((phase - 0.46) / 0.34);
        const knife = phase < 0.32 ? 0 : phase < 0.36 ? Math.pow((phase - 0.32) / 0.04, 3) : phase < 0.40 ? 1 : 1 - smoothStep((phase - 0.40) / 0.23);
        let lift = phase < 0.39 ? 1 : phase < 0.45 ? 1 - smoothStep((phase - 0.39) / 0.06) : phase < 0.81 ? 0 : smoothStep((phase - 0.81) / 0.15);
        const manual = model.scenario === 'stopped';
        const distance = Math.floor(cycle) * 392 + movement * 392;
        if (manual) lift = (1 - Math.cos(model.takeoffPosition * Math.PI / 180)) / 2;
        const packetX = phase < 0.36 ? 366 - 148 * feedProgress : 218 - 392 * movement;
        return {
          phase,
          manual,
          distance: manual ? 0 : distance,
          packetX,
          rollerY: 96 - lift * 34,
          knife: manual ? 0 : knife,
          feeding: !manual && phase < 0.28,
          cut: !manual && phase >= 0.36,
          feedDistance: manual ? 0 : Math.floor(cycle) * 148 + feedProgress * 148,
          wheelPhase: manual ? model.takeoffPosition * Math.PI / 180 : distance / 18,
          clamped: !manual && phase >= 0.45 && phase < 0.81,
          conveying: !manual && phase >= 0.46 && phase < 0.80,
          label: manual ? t("Ручная прокрутка") : phase < 0.28 ? t("Подача полотна") : phase < 0.32 ? t("Подача завершена") : phase < 0.36 ? t("Резка") : phase < 0.39 ? t("Задержка после резки") : phase < 0.45 ? t("Захват пакета") : phase < 0.81 ? t("Приём пакета") : t("Подъём приёмного вала")
        };
      }
      function drawKnifeAssembly(ctx, x, filmY, closure) {
        // С торца: массивные верхняя и нижняя балки, режущие кромки, направляющие и крепёж.
        // Высота открытого узла 132 против 96 у тянущей пары.
        ctx.save();
        ctx.translate(x, filmY);
        ctx.strokeStyle = rollerColors.guide;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const rail of [-32, 32]) {
          ctx.moveTo(rail, -68);
          ctx.lineTo(rail, 64);
        }
        ctx.moveTo(-38, 64);
        ctx.lineTo(38, 64);
        ctx.stroke();
        for (const top of [true, false]) {
          const edge = top ? -22 * (1 - closure) : 20 * (1 - closure);
          const outer = top ? edge - 32 : edge + 27;
          ctx.beginPath();
          ctx.moveTo(-26, outer);
          ctx.lineTo(22, outer);
          ctx.lineTo(28, top ? outer + 6 : outer - 6);
          ctx.lineTo(28, edge);
          ctx.lineTo(-26, edge);
          ctx.closePath();
          ctx.fillStyle = rollerColors.face;
          ctx.fill();
          ctx.strokeStyle = rollerColors.rim;
          ctx.lineWidth = 1.7;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-26, top ? edge - 7 : edge + 7);
          ctx.lineTo(28, top ? edge - 7 : edge + 7);
          ctx.strokeStyle = rollerColors.guide;
          ctx.lineWidth = 1.3;
          ctx.stroke();
          for (const bolt of [-15, 12]) {
            ctx.beginPath();
            ctx.arc(bolt, top ? outer + 10 : outer - 10, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = rollerColors.rim;
            ctx.fill();
          }
          ctx.beginPath();
          ctx.moveTo(-24, edge);
          ctx.lineTo(26, edge);
          ctx.strokeStyle = rollerColors.warm;
          ctx.lineWidth = 2.8;
          ctx.stroke();
          // Короткие ребра корпуса — схематический силуэт блока с фотографии.
          ctx.beginPath();
          for (let rib = 0; rib < 3; rib += 1) {
            const y = top ? outer + 6 + rib * 6 : outer - 5 - rib * 6;
            ctx.moveTo(-31, y);
            ctx.lineTo(-26, y);
          }
          ctx.strokeStyle = rollerColors.rim;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        ctx.restore();
      }
      function drawTransportWheel(ctx, x, y, radius, phase) {
        drawMechanismWheel(ctx, x, y, radius, phase);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = rollerColors.roller;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
      function drawProcessBelt(ctx, centers, radius, color, distance) {
        const normals = centers.map((point, index) => {
          const next = centers[(index + 1) % centers.length];
          const dx = next.x - point.x,
            dy = next.y - point.y;
          const length = Math.hypot(dx, dy);
          return {
            x: dy / length,
            y: -dx / length
          };
        });
        ctx.save();
        ctx.beginPath();
        const previous = normals[normals.length - 1];
        ctx.moveTo(centers[0].x + previous.x * radius, centers[0].y + previous.y * radius);
        for (let index = 0; index < centers.length; index += 1) {
          const center = centers[index],
            incoming = normals[(index + centers.length - 1) % centers.length],
            outgoing = normals[index];
          const start = Math.atan2(incoming.y, incoming.x);
          let end = Math.atan2(outgoing.y, outgoing.x);
          while (end < start) end += Math.PI * 2;
          ctx.arc(center.x, center.y, radius, start, end);
          const next = centers[(index + 1) % centers.length];
          ctx.lineTo(next.x + outgoing.x * radius, next.y + outgoing.y * radius);
        }
        ctx.closePath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.8;
        ctx.stroke();
        ctx.setLineDash([4, 10]);
        ctx.lineDashOffset = distance;
        ctx.strokeStyle = rollerColors.marks;
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.restore();
      }
      function drawTakeoffProcess(ctx, seconds, withAir = false) {
        const frame = takeoffCycle(seconds);
        const upper = [{
          x: 50,
          y: 96
        }, {
          x: 140,
          y: 38
        }, {
          x: 274,
          y: frame.rollerY
        }];
        const lower = [{
          x: 50,
          y: 144
        }, {
          x: 274,
          y: 144
        }];
        for (const center of upper) drawTransportWheel(ctx, center.x, center.y, 18, frame.wheelPhase);
        for (const center of lower) drawTransportWheel(ctx, center.x, center.y, 18, -frame.wheelPhase);
        // Контакт ремней с пакетом: верхняя ветвь нижнего на y=124, нижняя верхнего на y=116.
        drawProcessBelt(ctx, upper, 20, rollerColors.belt, -frame.distance);
        drawProcessBelt(ctx, lower, 20, rollerColors.lowerBelt, frame.distance);
        ctx.save();
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = rollerColors.rim;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(306, 62);
        ctx.lineTo(306, 96);
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(303, 67);
        ctx.lineTo(306, 62);
        ctx.lineTo(309, 67);
        ctx.moveTo(303, 91);
        ctx.lineTo(306, 96);
        ctx.lineTo(309, 91);
        ctx.strokeStyle = rollerColors.rim;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // До резки полотно единое от тянущей пары до передней кромки; после резки пакет отделён.
        ctx.fillStyle = rollerColors.packet;
        ctx.fillRect(frame.manual || frame.cut ? 371 : frame.packetX, 116, 628 - (frame.manual || frame.cut ? 371 : frame.packetX), 8);
        ctx.save();
        ctx.beginPath();
        ctx.rect(frame.manual || frame.cut ? 371 : frame.packetX, 116, 628, 8);
        ctx.clip();
        ctx.setLineDash([6, 18]);
        ctx.lineDashOffset = frame.feedDistance;
        ctx.strokeStyle = rollerColors.belt;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(200, 120);
        ctx.lineTo(640, 120);
        ctx.stroke();
        ctx.restore();
        if (!frame.manual && frame.cut && frame.packetX + 148 > 0) {
          const x = frame.packetX;
          ctx.beginPath();
          ctx.moveTo(x, 116);
          ctx.lineTo(x + 145, 116);
          ctx.lineTo(x + 148, 124);
          ctx.lineTo(x, 124);
          ctx.closePath();
          ctx.fillStyle = rollerColors.packet;
          ctx.fill();
          ctx.strokeStyle = rollerColors.marks;
          ctx.lineWidth = 0.9;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + 144, 116);
          ctx.lineTo(x + 144, 124);
          ctx.stroke();
          if (frame.clamped) {
            const start = Math.max(50, x),
              end = Math.min(274, x + 148);
            if (end > start) {
              ctx.beginPath();
              ctx.moveTo(start, 116);
              ctx.lineTo(end, 116);
              ctx.strokeStyle = rollerColors.belt;
              ctx.lineWidth = 2.6;
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(start, 124);
              ctx.lineTo(end, 124);
              ctx.strokeStyle = rollerColors.lowerBelt;
              ctx.stroke();
            }
          }
        }
        // Тянущая пара справа: противовращение подаёт плёнку влево только на участке подачи.
        for (const [index, y] of [93, 147].entries()) {
          drawTransportWheel(ctx, 516, y, 23, (index === 0 ? 1 : -1) * frame.feedDistance / 23);
          if (withAir) {
            ctx.beginPath();
            ctx.arc(516, y, 23, index === 0 ? 0.45 : -1.00, index === 0 ? 1.00 : -0.45);
            ctx.strokeStyle = rollerColors.face;
            ctx.lineWidth = 7;
            ctx.stroke();
          }
        }
        drawKnifeAssembly(ctx, 366, 120, frame.knife);
        return frame;
      }
      function intermittentFeed(seconds) {
        const cycle = seconds / 1.4;
        const phase = cycle % 1;
        return {
          distance: Math.floor(cycle) * 64 + smoothStep(phase / 0.52) * 64,
          moving: phase < 0.52
        };
      }
      function airWindowActive(angle) {
        // Значения заданий не переставляем и не исправляем: для рисунка учитываем циклический переход через ноль.
        const start = model.airStartAngle,
          stop = model.airStopAngle;
        if (start === stop) return false;
        if (start === 0 && stop === 360) return true;
        const a = start % 360,
          b = stop % 360;
        if (a === b) return false;
        return a < b ? angle >= a && angle < b : angle >= a || angle < b;
      }
      function drawAirProcess(ctx, seconds) {
        const frame = drawTakeoffProcess(ctx, seconds, true);
        const angle = frame.phase * 360;
        // Замедленная схема: воздух разрешён во время подачи и всегда прекращается до резки.
        // Независимые задания углов при этом не связываем и не изменяем.
        const blowing = rollerPlaying && frame.feeding && airWindowActive(angle);
        for (const top of [true, false]) {
          ctx.beginPath();
          ctx.moveTo(552, top ? 44 : 196);
          ctx.lineTo(552, top ? 83 : 157);
          ctx.quadraticCurveTo(552, top ? 95 : 145, 542, top ? 102 : 138);
          ctx.lineTo(535, top ? 108 : 132);
          ctx.quadraticCurveTo(526, top ? 114 : 126, 514, top ? 114 : 126);
          ctx.lineTo(486, top ? 114 : 126);
          ctx.strokeStyle = rollerColors.warm;
          ctx.lineWidth = 6;
          ctx.stroke();
          ctx.strokeStyle = rollerColors.face;
          ctx.lineWidth = 2.4;
          ctx.stroke();
          const y = top ? 114 : 126;
          ctx.beginPath();
          ctx.moveTo(486, y - 3);
          ctx.lineTo(486, y + 3);
          ctx.moveTo(491, y - 3);
          ctx.lineTo(491, y + 3);
          ctx.strokeStyle = rollerColors.warm;
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(547, top ? 60 : 180);
          ctx.lineTo(557, top ? 60 : 180);
          ctx.strokeStyle = rollerColors.rim;
          ctx.lineWidth = 2;
          ctx.stroke();
          if (blowing) for (let particle = 0; particle < 4; particle += 1) {
            const progress = (seconds * 3 + particle / 4) % 1;
            const x = 479 - progress * 96;
            ctx.save();
            ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.95;
            ctx.strokeStyle = rollerColors.belt;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(x + 8, y);
            ctx.quadraticCurveTo(x + 4, y + (top ? -2 : 2), x, y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x + 3, y - 2);
            ctx.lineTo(x, y);
            ctx.lineTo(x + 3, y + 2);
            ctx.stroke();
            ctx.restore();
          }
        }
        processText('[data-air-cycle-angle]', String(Math.round(Math.floor(seconds * 5) / 5 / 3.2 % 1 * 360)));
        processText('[data-air-phase]', blowing ? t("Подача · поддув") : frame.feeding ? t("Подача · воздух выключен") : frame.label + t(" · воздух выключен"));
        return {
          ...frame,
          blowing
        };
      }
      function drawMechanism(item, seconds) {
        // Схемы движений используют замедленный демоцикл, а показания останутся отдельными данными PLC.
        const {
          context: ctx,
          width,
          height,
          kind
        } = item;
        const view = kind === 'air' ? [160, 80] : kind === 'unwinder' ? [128, 92] : kind === 'eject' || kind === 'eject-process' || kind === 'tension' ? [144, 88] : kind === 'ballerina' ? [144, 116] : kind === 'temperature' ? [64, 80] : kind === 'seam' ? [360, 260] : kind === 'takeoff-process' ? [640, 210] : kind === 'tension-process' ? [450, 210] : kind === 'air-process' ? [640, 210] : [96, 64];
        ctx.setTransform(item.canvas.width / width, 0, 0, item.canvas.height / height, 0, 0);
        ctx.clearRect(0, 0, width, height);
        const scale = Math.min(width / view[0], height / view[1]);
        ctx.save();
        ctx.translate((width - view[0] * scale) / 2, (height - view[1] * scale) / 2);
        ctx.scale(scale, scale);
        if (kind === 'feedangles') {
          ctx.translate(view[0], 0);
          ctx.scale(-1, 1);
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = rollerColors.belt;
        ctx.fillStyle = rollerColors.face;
        ctx.lineWidth = 2.4;
        if (kind === 'takeoff-process') {
          const frame = drawTakeoffProcess(ctx, seconds);
          processText('[data-takeoff-phase]', model.scenario === 'running' || frame.manual ? frame.label : t("Остановка"));
        } else if (kind === 'air-process') {
          drawAirProcess(ctx, seconds);
        } else if (kind === 'tension-process') {
          const feed = intermittentFeed(seconds);
          drawTransportWheel(ctx, 74, 106, 20, -feed.distance / 20);
          drawTransportWheel(ctx, 376, 106, 20, -feed.distance / 20);
          const thickness = model.tensionSet < 0 ? 9 - Math.abs(model.tensionSet) * 0.43 : 9;
          ctx.beginPath();
          ctx.moveTo(74, 86);
          ctx.quadraticCurveTo(225, 86 + Math.max(0, model.tensionSet) * 7.2, 376, 86);
          ctx.strokeStyle = rollerColors.belt;
          ctx.lineWidth = thickness;
          ctx.stroke();
          ctx.save();
          ctx.setLineDash([5, 14]);
          ctx.lineDashOffset = feed.distance;
          ctx.strokeStyle = rollerColors.marks;
          ctx.lineWidth = Math.min(2, thickness * 0.55);
          ctx.stroke();
          ctx.restore();
          processText('[data-tension-phase]', rollerPlaying && feed.moving ? t("Подача справа налево") : t("Пауза подачи"));
        } else if (kind === 'air') {
          // Плавный поворот трубки и чёткий наконечник по мотивам эскиза.
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.moveTo(136, 9);
          ctx.quadraticCurveTo(136, 7, 138, 7);
          ctx.lineTo(146, 7);
          ctx.quadraticCurveTo(148, 7, 148, 9);
          ctx.bezierCurveTo(148, 43, 126, 66, 92, 66);
          ctx.lineTo(44, 66);
          ctx.lineTo(44, 74);
          ctx.quadraticCurveTo(44, 77, 41.5, 75.2);
          ctx.lineTo(20, 60.6);
          ctx.quadraticCurveTo(17.8, 59, 20, 57.4);
          ctx.lineTo(41.5, 42.8);
          ctx.quadraticCurveTo(44, 41, 44, 44);
          ctx.lineTo(44, 52);
          ctx.lineTo(92, 52);
          ctx.bezierCurveTo(119, 52, 136, 36, 136, 9);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          // Частицы идут от верхнего конца трубки по изгибу к выходу слева.
          for (let particle = 0; particle < 4; particle += 1) {
            const progress = (seconds / 1.35 + particle / 4) % 1;
            const point = airFlowPoint(progress);
            ctx.save();
            ctx.translate(point.x, point.y);
            ctx.rotate(point.angle);
            ctx.globalAlpha = Math.sin(Math.PI * progress) * 0.9;
            ctx.strokeStyle = rollerColors.marks;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(-4, -2);
            ctx.lineTo(0, 0);
            ctx.lineTo(-4, 2);
            ctx.stroke();
            ctx.restore();
          }
          for (const [index, y] of [53, 59, 65].entries()) {
            const progress = (seconds / 0.95 + index / 3) % 1;
            const x = 16 - progress * 12;
            ctx.save();
            ctx.globalAlpha = Math.sin(Math.PI * progress) * 0.75;
            ctx.strokeStyle = rollerColors.belt;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.quadraticCurveTo(x + 3, y - 1.5, x + 6, y);
            ctx.stroke();
            ctx.restore();
          }
        } else if (kind === 'feedangles') {
          const sweep = 0.84 + 0.33 * Math.sin(seconds * Math.PI * 2 / 3);
          ctx.beginPath();
          ctx.moveTo(50, 40);
          ctx.lineTo(50, 19);
          ctx.arc(50, 40, 21, -Math.PI / 2, -Math.PI / 2 + sweep);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(50, 40, 2.4, 0, Math.PI * 2);
          ctx.fillStyle = rollerColors.belt;
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(12, 53);
          ctx.lineTo(79, 53);
          ctx.moveTo(74, 48);
          ctx.lineTo(79, 53);
          ctx.lineTo(74, 58);
          ctx.strokeStyle = rollerColors.rim;
          ctx.lineWidth = 1.8;
          ctx.stroke();
          const progress = seconds / 1.7 % 1;
          const arrowX = 18 + progress * 54;
          ctx.save();
          ctx.globalAlpha = Math.sin(Math.PI * progress);
          ctx.strokeStyle = rollerColors.belt;
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.moveTo(arrowX - 4, 49);
          ctx.lineTo(arrowX, 53);
          ctx.lineTo(arrowX - 4, 57);
          ctx.stroke();
          ctx.restore();
        } else if (kind === 'knife') {
          const cycle = seconds / 2 % 1;
          // 140 мс на удар, 100 мс контакта, затем 1,44 с плавного раскрытия.
          const travel = cycle < 0.07 ? 10 * Math.pow(cycle / 0.07, 3) : cycle < 0.12 ? 10 : cycle < 0.84 ? 10 * (1 - smoothStep((cycle - 0.12) / 0.72)) : 0;
          ctx.beginPath();
          ctx.moveTo(10, 32);
          ctx.lineTo(86, 32);
          ctx.strokeStyle = rollerColors.rim;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.save();
          ctx.translate(48, 32);
          ctx.scale(1, 0.4);
          drawKnifeAssembly(ctx, 0, 0, travel / 10);
          ctx.restore();
          if (cycle >= 0.07 && cycle < 0.12) {
            ctx.globalAlpha = Math.sin((cycle - 0.07) / 0.05 * Math.PI);
            ctx.beginPath();
            for (const x of [11, 79]) {
              ctx.moveTo(x - 2, 29);
              ctx.lineTo(x + 2, 35);
            }
            ctx.stroke();
          }
        } else if (kind === 'unwinder') {
          // Рама, рулон, рычаг, верхний узел и его контур по второму рисунку.
          ctx.strokeStyle = rollerColors.rim;
          ctx.lineWidth = 1.8;
          ctx.strokeRect(16, 46, 64, 37);
          ctx.strokeRect(25, 41, 16, 15);
          ctx.beginPath();
          ctx.moveTo(36, 43);
          ctx.lineTo(80, 21);
          ctx.moveTo(40, 47);
          ctx.lineTo(84, 27);
          ctx.stroke();
          const rollPhase = seconds * Math.PI * 2 / 3.6;
          drawMechanismWheel(ctx, 79, 56, 22.5, rollPhase, true);
          drawMechanismWheel(ctx, 84, 22, 8.5, -rollPhase * 2.4);
          ctx.strokeStyle = rollerColors.belt;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(73, 9);
          ctx.lineTo(83, 22);
          ctx.lineTo(97, 10);
          ctx.closePath();
          ctx.stroke();
          ctx.strokeRect(81, 4, 6, 13);
        } else if (kind === 'eject' || kind === 'eject-process') {
          const basePeriod = 2.4;
          const baseOmega = Math.PI * 2 / basePeriod;
          const normalDuration = basePeriod * 0.75;
          const boostSpeed = kind === 'eject-process' ? model.ejectSpeedEnabled ? 1.875 * model.ejectSpeed / 270 : 1 : 1.25 * 1.5;
          const cycleDuration = normalDuration + basePeriod * 0.25 / boostSpeed;
          const time = seconds % cycleDuration;
          // Ускоренный участок в 1,5 раза быстрее прежнего: 1,875 основной скорости.
          let phase = time < normalDuration ? time * baseOmega : Math.PI * 1.5 + (time - normalDuration) * baseOmega * boostSpeed;
          if (kind === 'eject-process' && (!model.ejectEnabled || !rollerPlaying)) phase = model.ejectPosition * Math.PI / 180;
          for (const [index, center] of [[0, {
            x: 72,
            y: 26
          }], [1, {
            x: 72,
            y: 62
          }]]) {
            ctx.beginPath();
            ctx.arc(center.x, center.y, 12, 0, Math.PI * 2);
            ctx.fillStyle = rollerColors.face;
            ctx.fill();
            ctx.strokeStyle = rollerColors.rim;
            ctx.lineWidth = 1.3;
            ctx.stroke();
            ctx.save();
            ctx.translate(center.x, center.y);
            ctx.rotate(index === 0 ? Math.PI / 2 + phase : -Math.PI / 2 - phase);
            ctx.beginPath();
            ctx.moveTo(2.5, 0);
            ctx.lineTo(17, 0);
            ctx.moveTo(12.5, -2.5);
            ctx.lineTo(17, 0);
            ctx.lineTo(12.5, 2.5);
            ctx.strokeStyle = rollerColors.belt;
            ctx.lineWidth = 2.1;
            ctx.stroke();
            ctx.restore();
            ctx.beginPath();
            ctx.arc(center.x, center.y, 2.3, 0, Math.PI * 2);
            ctx.fillStyle = rollerColors.belt;
            ctx.fill();
          }
        } else if (kind === 'seam') {
          const drum = {
            x: 145,
            y: 126,
            radius: 58
          };
          const guide = {
            x: 223,
            y: 195,
            radius: 26
          };
          const filmRadius = 60;
          const guideFilmRadius = 28;
          const dx = guide.x - drum.x;
          const dy = guide.y - drum.y;
          const tangentAngle = Math.atan2(dy, dx) - Math.acos((filmRadius + guideFilmRadius) / Math.hypot(dx, dy));
          const enterAngle = -Math.PI * 0.75;
          const exitAngle = Math.PI * 0.75;
          const enter = {
            x: drum.x + Math.cos(enterAngle) * filmRadius,
            y: drum.y + Math.sin(enterAngle) * filmRadius
          };
          const exit = {
            x: guide.x + Math.cos(exitAngle) * guideFilmRadius,
            y: guide.y + Math.sin(exitAngle) * guideFilmRadius
          };
          drawMechanismWheel(ctx, drum.x, drum.y, drum.radius, seconds * 0.9);
          drawMechanismWheel(ctx, guide.x, guide.y, guide.radius, -seconds * 0.9 * drum.radius / guide.radius);
          // Непрерывная плёнка: большой барабан, внутренняя касательная, малый направляющий вал.
          ctx.beginPath();
          ctx.moveTo(enter.x - 48, enter.y + 48);
          ctx.lineTo(enter.x, enter.y);
          ctx.arc(drum.x, drum.y, filmRadius, enterAngle, tangentAngle);
          ctx.lineTo(guide.x - Math.cos(tangentAngle) * guideFilmRadius, guide.y - Math.sin(tangentAngle) * guideFilmRadius);
          ctx.arc(guide.x, guide.y, guideFilmRadius, tangentAngle + Math.PI, exitAngle, true);
          ctx.lineTo(exit.x + 39, exit.y + 39);
          ctx.strokeStyle = rollerColors.belt;
          ctx.lineWidth = 2.6;
          ctx.stroke();
          ctx.save();
          ctx.setLineDash([4, 10]);
          ctx.lineDashOffset = -seconds * 30;
          ctx.strokeStyle = rollerColors.marks;
          ctx.lineWidth = 1.25;
          ctx.stroke();
          ctx.restore();
          // Неподвижная стойка и ось рычага. Поворот поднимает полумесяц над полотном.
          ctx.strokeStyle = rollerColors.rim;
          ctx.lineWidth = 2;
          ctx.strokeRect(264, 94, 12, 91);
          ctx.beginPath();
          ctx.moveTo(257, 185);
          ctx.lineTo(283, 185);
          ctx.stroke();
          ctx.save();
          ctx.translate(270, 100);
          ctx.rotate((1 - seamPose) * 0.34);
          ctx.translate(-270, -100);
          const first = -Math.PI * 137 / 180;
          const last = -Math.PI * 24 / 180;
          const inside = filmRadius + 5;
          const outside = inside + 12;
          ctx.beginPath();
          ctx.arc(drum.x, drum.y, inside, first, last);
          ctx.lineTo(drum.x + Math.cos(last) * outside, drum.y + Math.sin(last) * outside);
          ctx.arc(drum.x, drum.y, outside, last, first, true);
          ctx.closePath();
          ctx.fillStyle = model.seamEnabled ? rollerColors.warm : rollerColors.face;
          ctx.globalAlpha = model.seamEnabled ? 0.18 : 1;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = model.seamEnabled ? rollerColors.warm : rollerColors.rim;
          ctx.lineWidth = 2.6;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(drum.x + Math.cos(last) * outside, drum.y + Math.sin(last) * outside);
          ctx.lineTo(251, 88);
          ctx.lineTo(270, 100);
          ctx.stroke();
          if (model.seamEnabled && seamPose > 0.88) {
            for (const [index, degrees] of [-125, -100, -75, -50].entries()) {
              const angle = degrees * Math.PI / 180;
              const progress = (seconds * 2 + index / 4) % 1;
              const radius = inside - 1 - progress * 3;
              ctx.globalAlpha = 0.4 + 0.6 * Math.sin(Math.PI * progress);
              ctx.beginPath();
              ctx.moveTo(drum.x + Math.cos(angle) * radius, drum.y + Math.sin(angle) * radius);
              ctx.lineTo(drum.x + Math.cos(angle) * (radius - 2), drum.y + Math.sin(angle) * (radius - 2));
              ctx.strokeStyle = rollerColors.warm;
              ctx.lineWidth = 2.2;
              ctx.stroke();
            }
          }
          ctx.restore();
          ctx.beginPath();
          ctx.arc(270, 100, 4, 0, Math.PI * 2);
          ctx.fillStyle = rollerColors.rim;
          ctx.fill();
        } else if (kind === 'tension') {
          const slack = (1 + Math.cos(seconds * Math.PI * 2 / 3.2)) / 2;
          drawMechanismWheel(ctx, 20, 44, 12, seconds * 1.8);
          drawMechanismWheel(ctx, 124, 44, 12, seconds * 1.8);
          ctx.strokeStyle = rollerColors.belt;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(22, 44);
          for (const [x, offset] of [[43, 0], [55, -12], [64, 12], [76, -27], [85, 10], [101, -1], [122, 0]]) ctx.lineTo(x, 44 + offset * slack);
          ctx.stroke();
        } else if (kind === 'ballerina') {
          const swing = Math.sin(seconds * Math.PI * 2 / 3.8) * Math.PI / 10;
          ctx.save();
          ctx.translate(25, 101);
          ctx.rotate(-Math.PI / 4 + swing);
          ctx.strokeStyle = rollerColors.belt;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(-3, -4);
          ctx.lineTo(94, -4);
          ctx.lineTo(94, 4);
          ctx.lineTo(-3, 4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          for (const distance of [16, 38, 60, 82]) drawMechanismWheel(ctx, distance, 0, 9, -seconds * Math.PI * 2 / 1.8);
          ctx.restore();
          ctx.beginPath();
          ctx.moveTo(14, 109);
          ctx.lineTo(36, 109);
          ctx.moveTo(25, 101);
          ctx.lineTo(25, 109);
          ctx.strokeStyle = rollerColors.rim;
          ctx.lineWidth = 1.8;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(25, 101, 3.1, 0, Math.PI * 2);
          ctx.fillStyle = rollerColors.belt;
          ctx.fill();
        } else if (kind === 'edge') {
          const center = 39 + 5 * Math.sin(seconds * Math.PI * 2 / 3.1);
          const left = center - 14.5;
          const right = center + 14.5;
          ctx.beginPath();
          ctx.rect(left, 5, 29, 55);
          ctx.fill();
          ctx.strokeStyle = rollerColors.rim;
          ctx.lineWidth = 1.8;
          ctx.stroke();
          ctx.save();
          ctx.beginPath();
          ctx.rect(left + 1, 6, 27, 53);
          ctx.clip();
          ctx.strokeStyle = rollerColors.belt;
          ctx.lineWidth = 1.7;
          for (let band = -1; band < 4; band += 1) {
            const y = 7 + band * 18 + seconds * 24 % 18;
            ctx.beginPath();
            ctx.moveTo(center, y - 3);
            ctx.lineTo(center, y + 3);
            ctx.moveTo(center - 3, y);
            ctx.lineTo(center, y + 3);
            ctx.lineTo(center + 3, y);
            ctx.stroke();
          }
          ctx.restore();
          ctx.strokeStyle = rollerColors.belt;
          ctx.lineWidth = 1.8;
          ctx.strokeRect(75, 24, 13, 16);
          ctx.beginPath();
          ctx.arc(81.5, 32, 2.2, 0, Math.PI * 2);
          ctx.fillStyle = rollerColors.belt;
          ctx.fill();
          ctx.save();
          ctx.setLineDash([2.2, 3]);
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          ctx.moveTo(74, 32);
          ctx.lineTo(right + 1, 32);
          ctx.stroke();
          ctx.restore();
          ctx.beginPath();
          ctx.moveTo(88, 32);
          ctx.lineTo(93, 32);
          ctx.strokeStyle = rollerColors.rim;
          ctx.stroke();
        } else if (kind === 'temperature') {
          const flicker = Math.sin(seconds * Math.PI * 2 / 1.3);
          const lean = 3 * Math.sin(seconds * Math.PI * 2 / 2.1);
          ctx.beginPath();
          ctx.moveTo(31, 72);
          ctx.bezierCurveTo(10, 69, 9, 51, 22, 35 + flicker * 2);
          ctx.bezierCurveTo(29, 28, 25, 21, 29 + lean, 10 + flicker * 3);
          ctx.bezierCurveTo(44 + lean, 24, 48, 32, 42, 43);
          ctx.bezierCurveTo(47, 43, 50, 39, 50, 35 - flicker * 2);
          ctx.bezierCurveTo(62, 53, 56, 70, 39, 72);
          ctx.closePath();
          ctx.fillStyle = rollerColors.face;
          ctx.fill();
          ctx.strokeStyle = rollerColors.warm;
          ctx.lineWidth = 2.7;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(31, 68);
          ctx.bezierCurveTo(22, 62, 29, 55, 33 + lean, 45 + flicker * 2);
          ctx.bezierCurveTo(40, 55, 45, 62, 37, 68);
          ctx.strokeStyle = rollerColors.warm;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (kind === 'glue') {
          ctx.fillStyle = rollerColors.face;
          ctx.fillRect(6, 49, 84, 12);
          ctx.strokeStyle = rollerColors.rim;
          ctx.lineWidth = 1.4;
          ctx.strokeRect(6, 49, 84, 12);
          ctx.save();
          ctx.beginPath();
          ctx.rect(7, 50, 82, 10);
          ctx.clip();
          for (let mark = -1; mark < 6; mark += 1) {
            const x = 6 + mark * 16 + seconds * 24 % 16;
            ctx.beginPath();
            ctx.moveTo(x, 50);
            ctx.lineTo(x + 4, 60);
            ctx.stroke();
          }
          const progress = seconds / 1.2 % 1;
          ctx.fillStyle = rollerColors.belt;
          for (let dot = 0; dot < 3; dot += 1) {
            const x = 48 + ((progress + 0.38) % 1 + dot) * 28.8;
            ctx.beginPath();
            ctx.arc(x, 55, 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          if (progress < 0.62) {
            const y = 28 + 27 * Math.pow(progress / 0.62, 1.65);
            ctx.beginPath();
            ctx.moveTo(48, y - 5);
            ctx.bezierCurveTo(44, y, 44.7, y + 2, 48, y + 2);
            ctx.bezierCurveTo(51.3, y + 2, 52, y, 48, y - 5);
            ctx.closePath();
            ctx.fillStyle = rollerColors.belt;
            ctx.fill();
          }
        }
        ctx.restore();
      }
      function drawRollers(seconds) {
        // Торцевая схема. Демопериод замедлен для просмотра; это не фаза движения реального PLC.
        const phase = seconds / 2.2 * Math.PI * 2;
        const radius = 12;
        const beltRadius = 14;
        const left = {
          x: 30,
          y: 26
        };
        const stroke = 2 * radius * 1.25;
        const right = {
          x: 113,
          y: left.y + stroke * (1 + Math.cos(phase)) / 2
        };
        const angle = Math.atan2(right.y - left.y, right.x - left.x);
        // Нормаль к линии центров даёт внешние касательные ремня к обоим валам.
        const normal = {
          x: Math.sin(angle),
          y: -Math.cos(angle)
        };
        const arcStart = angle - Math.PI / 2;
        for (const item of rollerCanvases) {
          if (!item.visible) continue;
          if (item.kind !== 'takeoff') {
            drawMechanism(item, seconds);
            continue;
          }
          const {
            context: ctx,
            width,
            height
          } = item;
          ctx.setTransform(item.canvas.width / width, 0, 0, item.canvas.height / height, 0, 0);
          ctx.clearRect(0, 0, width, height);
          const scale = Math.min(width / 144, height / 88);
          ctx.save();
          ctx.translate((width - 144 * scale) / 2, (height - 88 * scale) / 2);
          ctx.scale(scale, scale);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          if (width > 150) {
            ctx.beginPath();
            ctx.moveTo(138, left.y);
            ctx.lineTo(138, left.y + stroke);
            ctx.moveTo(135, left.y);
            ctx.lineTo(141, left.y);
            ctx.moveTo(135, left.y + stroke);
            ctx.lineTo(141, left.y + stroke);
            ctx.lineWidth = 1;
            ctx.strokeStyle = rollerColors.guide;
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.moveTo(left.x + normal.x * beltRadius, left.y + normal.y * beltRadius);
          ctx.lineTo(right.x + normal.x * beltRadius, right.y + normal.y * beltRadius);
          ctx.arc(right.x, right.y, beltRadius, arcStart, arcStart + Math.PI);
          ctx.lineTo(left.x - normal.x * beltRadius, left.y - normal.y * beltRadius);
          ctx.arc(left.x, left.y, beltRadius, arcStart + Math.PI, arcStart + 2 * Math.PI);
          ctx.closePath();
          ctx.lineWidth = 2.4;
          ctx.strokeStyle = rollerColors.belt;
          ctx.stroke();
          ctx.setLineDash([4, 7]);
          ctx.lineDashOffset = -phase * beltRadius;
          ctx.lineWidth = 1.25;
          ctx.strokeStyle = rollerColors.marks;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
          for (const center of [left, right]) {
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
            ctx.fillStyle = rollerColors.face;
            ctx.fill();
            ctx.lineWidth = 1.3;
            ctx.strokeStyle = rollerColors.rim;
            ctx.stroke();
            ctx.save();
            ctx.translate(center.x, center.y);
            ctx.rotate(phase);
            ctx.strokeStyle = rollerColors.rim;
            ctx.lineWidth = 1.35;
            for (let spoke = 0; spoke < 3; spoke += 1) {
              const a = spoke / 3 * 2 * Math.PI;
              ctx.beginPath();
              ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
              ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
              ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(8, 0, 1.8, 0, 2 * Math.PI);
            ctx.fillStyle = rollerColors.belt;
            ctx.fill();
            ctx.restore();
            ctx.beginPath();
            ctx.arc(center.x, center.y, 2.3, 0, 2 * Math.PI);
            ctx.fillStyle = rollerColors.belt;
            ctx.fill();
          }
          ctx.restore();
        }
      }
      function frame(now) {
        rollerFrame = null;
        if (rollerDisposed || !rollerPlaying && !seamTransition) return;
        if (rollerPlaying && rollerLastFrame !== null) rollerElapsed += Math.min(.1, Math.max(0, (now - rollerLastFrame) / 1000));
        rollerLastFrame = rollerPlaying ? now : null;
        let settled = false;
        if (seamTransition) {
          const fraction = Math.min(1, Math.max(0, (now-seamTransition.started)/450));
          seamPose = seamTransition.from + (seamTransition.to-seamTransition.from)*smoothStep(fraction);
          if (fraction === 1) {seamTransition = null;settled = true;}
        }
        if (now - lastPaint >= 33 || settled) {
          drawRollers(rollerElapsed);
          lastPaint = now;
        }
        if (rollerPlaying || seamTransition) rollerFrame = requestAnimationFrame(frame);
      }
      function update(running, motion, values = {}) {
        let modelChanged=false;
        for (const key of ['tensionSet','airStartAngle','airStopAngle','ejectSpeed','ejectSpeedEnabled','ejectEnabled','seamEnabled']) {
          if (!Number.isFinite(values[key])) continue;
          const value=key==='tensionSet'?Math.max(-15,Math.min(15,values[key]*15/25)):values[key];
          if(model[key]!==value){model[key]=value;modelChanged=true;}
        }
        let play = Boolean(running && motion && !document.hidden && !rollerDisposed);
        model.scenario = running ? 'running' : 'stopped';
        let changed = false;
        for (const item of rollerCanvases) {
          const visible = !item.canvas.closest('[hidden],[data-equipment="unknown"]');
          if (visible !== item.visible) {
            changed = true;
            item.visible = visible;
            if (visible) fitBackingStore(item);
            else {
              // Hidden diagrams do not need large 4K backing stores.
              if (item.canvas.width !== item.width) item.canvas.width = item.width;
              if (item.canvas.height !== item.height) item.canvas.height = item.height;
            }
          }
          item.visible = visible;
        }
        play = play && rollerCanvases.some(item => item.visible);
        const target = model.seamEnabled ? 1 : 0;
        const seamVisible = rollerCanvases.some(item => item.visible && item.kind === 'seam');
        if (!motion || document.hidden || !seamVisible) {
          if (seamPose !== target || seamTransition) modelChanged = true;
          seamPose = target;seamTransition = null;
        } else if ((seamTransition?.to ?? seamPose) !== target) {
          seamTransition = {from:seamPose,to:target,started:performance.now()};
        }
        root.dataset.rollerPlaying = String(play);
        const playChanged = play !== rollerPlaying;
        rollerPlaying = play;
        if (playChanged) rollerLastFrame = null;
        if (changed || modelChanged || playChanged) drawRollers(rollerElapsed);
        if (!play && !seamTransition && rollerFrame !== null) {cancelAnimationFrame(rollerFrame);rollerFrame=null;}
        if ((play || seamTransition) && rollerFrame === null) rollerFrame = requestAnimationFrame(frame);
      }
      function dispose() {
        rollerDisposed = true;
        if (rollerFrame !== null) cancelAnimationFrame(rollerFrame);
        if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
        resizeObserver?.disconnect();
        detachDensityQuery();
        window.visualViewport?.removeEventListener('resize', queueResize);
        document.removeEventListener('visibilitychange', queueResize);
      }
      function refreshPalette() {
        if (rollerDisposed) return;
        readPalette();
        // Repaint even when motion is disabled, preserving phase and seam pose.
        drawRollers(rollerElapsed);
      }
      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(queueResize);
        for (const item of rollerCanvases) resizeObserver.observe(item.canvas);
      }
      watchDensity();
      window.visualViewport?.addEventListener('resize', queueResize);
      document.addEventListener('visibilitychange', queueResize);
      resize();
      drawRollers(0);
      return {
        update,
        resize,
        refreshPalette,
        dispose
      };
    }
  };
})();
