/* Horalator Web — app logic */
(function () {
  'use strict';

  const STORAGE = {
    workData: 'horalator.workData.v1',
    theme: 'horalator.theme',
    reminderEnabled: 'horalator.reminders.enabled',
    reminderTime: 'horalator.reminders.time',
    reminderLast: 'horalator.reminders.last',
    lastStart: 'horalator.lastStart',
    lastEnd: 'horalator.lastEnd'
  };

  const WEEKDAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const WEEKDAYS_LONG = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const TARGET_MINUTES = 8 * 60;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const dom = {};
  const state = {
    workData: {},
    themeSetting: 'system',
    reminders: { enabled: false, time: '18:00' },
    activeTab: 'daily',
    currentNetMinutes: 0,
    editingDate: null,
    calendarFilter: 'all',
    installPrompt: null,
    lastRenderDate: '',
    reminderTimer: null,
    confirmResolver: null
  };

  /* ---------- Storage helpers ---------- */

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function removeStorage(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      /* Storage can be unavailable in private modes. */
    }
  }

  function storageIsAvailable() {
    try {
      const key = '__horalator_test__';
      window.localStorage.setItem(key, '1');
      window.localStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  /* ---------- Date and duration helpers ---------- */

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function roundHours(minutes) {
    return Math.round((minutes / 60) * 1000000) / 1000000;
  }

  function formatMinutes(totalMinutes) {
    if (!Number.isFinite(totalMinutes)) return '00:00';
    const negative = totalMinutes < 0;
    let minutes = Math.abs(Math.round(totalMinutes));
    const hours = Math.floor(minutes / 60);
    minutes %= 60;
    return `${negative ? '-' : ''}${pad2(hours)}:${pad2(minutes)}`;
  }

  function formatDuration(hours) {
    return formatMinutes(Number(hours) * 60);
  }

  function toDateKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function fromDateKey(key) {
    if (typeof key !== 'string') return null;
    const match = key.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  function todayDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  }

  function addDays(date, amount) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, 12, 0, 0, 0);
  }

  function startOfWeek(date) {
    const weekdayFromMonday = (date.getDay() + 6) % 7;
    return addDays(date, -weekdayFromMonday);
  }

  function weekdayIndex(date) {
    return (date.getDay() + 6) % 7;
  }

  function formatDateLong(date) {
    return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${WEEKDAYS_LONG[date.getDay()]}`;
  }

  function formatWeekRange(start, end, includeYear) {
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    if (sameMonth) {
      return `${start.getDate()} – ${end.getDate()} ${MONTHS_SHORT[start.getMonth()]}${includeYear ? ` ${start.getFullYear()}` : ''}`;
    }
    if (start.getFullYear() === end.getFullYear()) {
      return `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}${includeYear ? ` ${start.getFullYear()}` : ''}`;
    }
    return `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} ${start.getFullYear()} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
  }

  function monthLabelFromKey(key) {
    const match = String(key).match(/^(\d{4})-(\d{2})$/);
    if (!match) return key;
    return `${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
  }

  function parseDuration(value) {
    if (typeof value !== 'string') return null;
    let text = value.trim().replace(',', ':');
    if (!text) return null;

    if (text.includes(':')) {
      const parts = text.split(':');
      if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[0]) || !/^\d{1,2}$/.test(parts[1])) return null;
      const hours = Number(parts[0]);
      const minutes = Number(parts[1]);
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
      return hours * 60 + minutes;
    }

    if (!/^\d{1,4}$/.test(text)) return null;
    if (text.length <= 2) {
      const hours = Number(text);
      return hours <= 23 ? hours * 60 : null;
    }
    const minutes = Number(text.slice(-2));
    const hours = Number(text.slice(0, -2));
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function parseClock(value) {
    if (typeof value !== 'string') return null;
    const match = value.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

    // Mirrors the Android app's workplace rounding rules.
    const roundedStart = hour === 7;
    const roundedEnd = hour === 17;
    const adjusted = roundedStart ? 8 * 60 : roundedEnd ? 17 * 60 : hour * 60 + minute;
    return {
      minutes: hour * 60 + minute,
      adjusted,
      roundedStart,
      roundedEnd
    };
  }

  function calculateWork(start, end, dinnerSelected) {
    let total = end.adjusted - start.adjusted;
    if (total < 0) total += 24 * 60;

    let baseBreak;
    if (total < 4 * 60) baseBreak = 15;
    else if (total < 7.5 * 60) baseBreak = 30;
    else if (total < 11 * 60) baseBreak = 60;
    else baseBreak = 90;

    const dinnerEligible = end.adjusted >= 18 * 60;
    const dinnerExtra = dinnerSelected && dinnerEligible ? 30 : 0;
    const breakMinutes = Math.min(90, baseBreak + dinnerExtra);
    const net = Math.max(0, total - breakMinutes);

    return {
      total,
      baseBreak,
      breakMinutes,
      dinnerEligible,
      dinnerExtra,
      net
    };
  }

  /* ---------- Data ---------- */

  function sanitizeData(raw) {
    const data = {};
    let skipped = 0;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { data, skipped };
    }

    Object.entries(raw).forEach(([key, value]) => {
      const date = fromDateKey(key);
      let minutes = null;

      if (typeof value === 'number') {
        minutes = Math.round(value * 60);
      } else if (typeof value === 'string' && value.includes(':')) {
        minutes = parseDuration(value);
      }

      if (minutes === null && (typeof value === 'number' || typeof value === 'string')) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) minutes = Math.round(numeric * 60);
      }

      if (!date || date.getDay() === 0 || minutes === null || !Number.isFinite(minutes)) {
        skipped += 1;
        return;
      }
      if (minutes <= 0 || minutes > 24 * 60) {
        skipped += 1;
        return;
      }
      data[toDateKey(date)] = roundHours(minutes);
    });

    return { data, skipped };
  }

  function loadWorkData() {
    const stored = readStorage(STORAGE.workData);
    if (!stored) return {};
    try {
      return sanitizeData(JSON.parse(stored)).data;
    } catch (error) {
      return {};
    }
  }

  function saveWorkData() {
    const success = writeStorage(STORAGE.workData, JSON.stringify(state.workData));
    if (!success) {
      showToast('Veriler kaydedilemedi. Tarayıcı depolama alanını kontrol edin.', { type: 'error', duration: 6500 });
    }
    return success;
  }

  function loadReminderSettings() {
    const enabled = readStorage(STORAGE.reminderEnabled) === 'true';
    const storedTime = readStorage(STORAGE.reminderTime);
    const validTime = typeof storedTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(storedTime);
    return { enabled, time: validTime ? storedTime : '18:00' };
  }

  function countWorkDays(data) {
    return Object.keys(data).length;
  }

  /* ---------- Theme ---------- */

  function getEffectiveTheme(setting) {
    if (setting === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return setting === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(setting, persist = true) {
    state.themeSetting = ['system', 'light', 'dark'].includes(setting) ? setting : 'system';
    if (persist) writeStorage(STORAGE.theme, state.themeSetting);

    const effective = getEffectiveTheme(state.themeSetting);
    document.documentElement.dataset.theme = effective;

    const metaTheme = $('#metaThemeColor');
    if (metaTheme) metaTheme.setAttribute('content', effective === 'dark' ? '#050a1c' : '#eef2ff');

    const toggle = dom.themeToggle;
    if (toggle) {
      toggle.setAttribute('aria-label', effective === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç');
    }

    $$('input[name="theme"]').forEach((radio) => {
      radio.checked = radio.value === state.themeSetting;
    });
  }

  /* ---------- Tabs ---------- */

  function setTab(tab, options = {}) {
    const valid = ['daily', 'calendar', 'settings'];
    state.activeTab = valid.includes(tab) ? tab : 'daily';

    $$('.view').forEach((view) => {
      view.hidden = view.id !== `view-${state.activeTab}`;
    });

    $$('.nav-tab[data-tab], .bottom-tab[data-tab]').forEach((button) => {
      const active = button.dataset.tab === state.activeTab;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });

    if (options.updateHash !== false) {
      try {
        window.history.replaceState(null, '', `#${state.activeTab}`);
      } catch (error) {
        /* Some browsers restrict history on local files. */
      }
    }

    if (options.scroll !== false) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    }

    if (state.activeTab === 'daily') {
      updateTodayUi();
      updateDaily();
      renderWeekSnapshot();
    } else if (state.activeTab === 'calendar') {
      renderCalendar();
    } else {
      renderSettingsData();
      updateReminderUi();
      updatePermissionUi();
      applyTheme(state.themeSetting, false);
    }

    document.title =
      state.activeTab === 'calendar'
        ? 'Takvim — Horalator'
        : state.activeTab === 'settings'
          ? 'Ayarlar — Horalator'
          : 'Horalator — Mesai Hesaplama';
  }

  /* ---------- Daily view ---------- */

  function updateTodayUi() {
    if (dom.todayPillText) dom.todayPillText.textContent = formatDateLong(todayDate());
  }

  function updateDaily() {
    const start = parseClock(dom.startTime.value);
    const end = parseClock(dom.endTime.value);
    const hasBoth = Boolean(start && end);

    const dinnerEligible = Boolean(end && end.adjusted >= 18 * 60);
    if (!dinnerEligible) dom.dinnerToggle.checked = false;

    let calculation = null;
    if (hasBoth) {
      calculation = calculateWork(start, end, dom.dinnerToggle.checked);
    }

    dom.dinnerToggle.disabled = !dinnerEligible;
    dom.dinnerRow.classList.toggle('is-disabled', !dinnerEligible);
    dom.dinnerRow.classList.toggle('is-enabled', dinnerEligible && dom.dinnerToggle.checked);

    if (!dinnerEligible) {
      dom.dinnerHint.textContent = '18:00 ve sonrası çıkışlarda kullanılabilir';
    } else if (dom.dinnerToggle.checked) {
      dom.dinnerHint.textContent = 'Eklendi: toplam molaya +30 dk';
    } else {
      dom.dinnerHint.textContent = 'Seçilirse toplam molaya +30 dk eklenir';
    }

    const netMinutes = calculation ? calculation.net : 0;
    state.currentNetMinutes = netMinutes;

    dom.netTime.textContent = formatMinutes(netMinutes);
    dom.grossTime.textContent = formatMinutes(calculation ? calculation.total : 0);
    dom.breakTime.textContent = formatMinutes(calculation ? calculation.breakMinutes : 0);

    const ringOffset = 100 - Math.min(netMinutes / TARGET_MINUTES, 1) * 100;
    dom.ringValue.style.strokeDashoffset = String(ringOffset);

    if (!calculation || netMinutes <= 0) {
      dom.targetDelta.textContent = '—';
      dom.targetDelta.classList.remove('is-good', 'is-warn');
      dom.statusChip.textContent = hasBoth ? 'Süre yok' : 'Saat girin';
      dom.statusChip.dataset.state = 'empty';
      dom.resultNote.classList.remove('is-good');
      dom.resultNote.querySelector('span').textContent = hasBoth
        ? 'Giriş ve çıkış saatleri geçerli bir süre oluşturmuyor.'
        : 'Sonuç, giriş ve çıkış saatleri girildiğinde güncellenir.';
      dom.breakDetail.textContent = 'Molalar çalışma süresine göre otomatik hesaplanır.';
    } else {
      const difference = netMinutes - TARGET_MINUTES;
      if (difference > 0) {
        dom.targetDelta.textContent = `+${formatMinutes(difference)}`;
        dom.targetDelta.classList.add('is-good');
        dom.targetDelta.classList.remove('is-warn');
        dom.statusChip.textContent = 'Hedef aşıldı';
        dom.statusChip.dataset.state = 'good';
        dom.resultNote.classList.add('is-good');
        dom.resultNote.querySelector('span').textContent = `8 saat hedefinin ${formatMinutes(difference)} üzerindesiniz.`;
      } else if (difference < 0) {
        dom.targetDelta.textContent = `-${formatMinutes(-difference)}`;
        dom.targetDelta.classList.remove('is-good');
        dom.targetDelta.classList.add('is-warn');
        dom.statusChip.textContent = 'Hedefin altında';
        dom.statusChip.dataset.state = 'warn';
        dom.resultNote.classList.remove('is-good');
        dom.resultNote.querySelector('span').textContent = `8 saat hedefine ${formatMinutes(-difference)} daha var.`;
      } else {
        dom.targetDelta.textContent = 'Hedefte';
        dom.targetDelta.classList.add('is-good');
        dom.targetDelta.classList.remove('is-warn');
        dom.statusChip.textContent = 'Hedef tamam';
        dom.statusChip.dataset.state = 'good';
        dom.resultNote.classList.add('is-good');
        dom.resultNote.querySelector('span').textContent = 'Tam olarak 8 saatlik günlük hedefi tamamladınız.';
      }

      const dinnerText = calculation.dinnerExtra ? ' + akşam yemeği 30 dk' : '';
      dom.breakDetail.textContent = `Temel mola ${formatMinutes(calculation.baseBreak)}${dinnerText}.`;
    }

    dom.addToCalendarBtn.disabled = netMinutes <= 0;

    let note = 'Hesaplama için iki saati de girin.';
    let noteIsError = false;
    if (hasBoth && netMinutes <= 0) {
      note = 'Geçerli bir net mesai oluşmadı. Saatleri kontrol edin.';
      noteIsError = true;
    } else if (calculation) {
      const roundingNotes = [];
      if (start.roundedStart) roundingNotes.push('07:xx girişi 08:00 kabul edildi');
      if (end.roundedEnd) roundingNotes.push('17:xx çıkışı 17:00 kabul edildi');
      note = roundingNotes.length
        ? `${roundingNotes.join(' · ')}.`
        : 'Hesaplama hazır. Takvime ekleyebilirsiniz.';
    }
    dom.calcNote.textContent = note;
    dom.calcNote.classList.toggle('is-error', noteIsError);
  }

  function renderWeekSnapshot() {
    const today = todayDate();
    const monday = startOfWeek(today);
    const saturday = addDays(monday, 5);
    const days = Array.from({ length: 6 }, (_, index) => addDays(monday, index));

    let totalMinutes = 0;
    let recordedWeekdays = 0;
    days.forEach((day) => {
      const hours = state.workData[toDateKey(day)] || 0;
      const minutes = Math.round(hours * 60);
      totalMinutes += minutes;
      if (day.getDay() >= 1 && day.getDay() <= 5 && minutes > 0) recordedWeekdays += 1;
    });

    dom.weekRange.textContent = formatWeekRange(monday, saturday, true);
    dom.weekTotal.textContent = formatMinutes(totalMinutes);
    dom.weekTarget.textContent = `/ ${formatMinutes(40 * 60)}`;
    dom.weekDayCount.textContent = `${recordedWeekdays} / 5 gün`;

    const difference = totalMinutes - 40 * 60;
    dom.weekDelta.textContent =
      difference > 0
        ? `${formatMinutes(difference)} fazla`
        : difference < 0
          ? `Hedefe ${formatMinutes(-difference)} kaldı`
          : 'Hedef tamam';

    const percent = Math.min((totalMinutes / (40 * 60)) * 100, 100);
    dom.weekProgress.style.width = `${percent}%`;
    dom.weekProgress.classList.toggle('is-over', totalMinutes > 40 * 60);
    dom.weekProgressBar.setAttribute('aria-valuenow', String(Math.round((totalMinutes / 60) * 10) / 10));

    dom.weekMiniDays.innerHTML = days
      .map((day) => {
        const key = toDateKey(day);
        const hours = state.workData[key] || 0;
        const hasHours = hours > 0;
        const isToday = key === toDateKey(today);
        return `<div class="mini-day${hasHours ? ' has-hours' : ''}${isToday ? ' is-today' : ''}">
          <span class="mini-day-name">${WEEKDAYS_SHORT[weekdayIndex(day)]}</span>
          <span class="mini-day-num">${day.getDate()}</span>
          <span class="mini-day-hours">${hasHours ? formatDuration(hours) : '—'}</span>
        </div>`;
      })
      .join('');
  }

  function rememberTimes() {
    if (dom.startTime.value) writeStorage(STORAGE.lastStart, dom.startTime.value);
    if (dom.endTime.value) writeStorage(STORAGE.lastEnd, dom.endTime.value);
  }

  /* ---------- Calendar view ---------- */

  function buildWeekGroups() {
    const segments = new Map();

    Object.keys(state.workData).forEach((key) => {
      const date = fromDateKey(key);
      if (!date) return;
      const monday = startOfWeek(date);
      const weekDays = Array.from({ length: 6 }, (_, index) => addDays(monday, index));

      let current = [];
      const addSegment = (daysInSegment) => {
        if (!daysInSegment.length) return;
        const start = daysInSegment[0];
        const end = daysInSegment[daysInSegment.length - 1];
        const segmentKey = `${toDateKey(start)}_${toDateKey(end)}`;
        if (!segments.has(segmentKey)) {
          segments.set(segmentKey, { start, end, days: daysInSegment.slice() });
        }
      };

      weekDays.forEach((day) => {
        if (current.length && current[0].getMonth() !== day.getMonth()) {
          addSegment(current);
          current = [];
        }
        current.push(day);
      });
      addSegment(current);
    });

    const sorted = Array.from(segments.values()).sort((a, b) => b.start - a.start);
    const groups = [];
    sorted.forEach((segment) => {
      const key = monthKey(segment.start);
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) {
        group = { key, date: segment.start, segments: [] };
        groups.push(group);
      }
      group.segments.push(segment);
    });

    return groups;
  }

  function segmentTotals(segment) {
    let total = 0;
    segment.days.forEach((day) => {
      total += Math.round((state.workData[toDateKey(day)] || 0) * 60);
    });
    const workingDays = segment.days.filter((day) => day.getDay() >= 1 && day.getDay() <= 5).length;
    return { total, target: workingDays * 8 * 60, workingDays };
  }

  function renderWeekCard(segment) {
    const today = todayDate();
    const totals = segmentTotals(segment);
    const difference = totals.total - totals.target;
    const isCurrent = toDateKey(startOfWeek(today)) === toDateKey(startOfWeek(segment.start));
    const percent = totals.target > 0 ? Math.min((totals.total / totals.target) * 100, 100) : 0;

    const cells = Array(6).fill(null);
    segment.days.forEach((day) => {
      cells[weekdayIndex(day)] = day;
    });

    const dayCells = cells
      .map((day) => {
        if (!day) return '<span class="day-tile is-ghost" aria-hidden="true"></span>';
        const key = toDateKey(day);
        const hours = state.workData[key] || 0;
        const hasHours = hours > 0;
        const isToday = key === toDateKey(today);
        const label = `${formatDateLong(day)}, ${hasHours ? `${formatDuration(hours)} kayıtlı` : 'kayıt yok'}. Düzenle.`;
        return `<button class="day-tile${hasHours ? ' has-hours' : ''}${isToday ? ' is-today' : ''}" type="button" data-date="${key}" aria-label="${label}">
          <span class="day-name">${WEEKDAYS_SHORT[weekdayIndex(day)]}</span>
          <span class="day-num">${day.getDate()}</span>
          <span class="day-hours">${hasHours ? formatDuration(hours) : '—'}</span>
        </button>`;
      })
      .join('');

    let differenceChip = '';
    if (difference > 0) {
      differenceChip = `<span class="week-diff is-positive">+${formatMinutes(difference)}</span>`;
    } else if (difference < 0) {
      differenceChip = `<span class="week-diff is-negative">-${formatMinutes(-difference)}</span>`;
    } else if (totals.target > 0) {
      differenceChip = '<span class="week-diff is-positive">Hedefte</span>';
    }

    return `<article class="week-card${isCurrent ? ' is-current' : ''}" id="week-${toDateKey(segment.start)}">
      <div class="week-card-head">
        <div class="week-card-title">
          <span class="week-range">${formatWeekRange(segment.start, segment.end, false)}</span>
          ${isCurrent ? '<span class="week-badge">Bu hafta</span>' : ''}
        </div>
        <div class="week-card-amount">
          <strong>${formatMinutes(totals.total)}</strong>
          <span>/ ${formatMinutes(totals.target)}</span>
        </div>
      </div>
      <div class="week-card-meta">
        <span class="week-target-label">${totals.workingDays} iş günü × 8 saat</span>
        ${differenceChip}
      </div>
      <div class="progress compact"><span${totals.total > totals.target ? ' class="is-over"' : ''} style="width: ${percent}%"></span></div>
      <div class="day-grid">${dayCells}</div>
    </article>`;
  }

  function renderCalendar() {
    const groups = buildWeekGroups();
    const hasData = countWorkDays(state.workData) > 0;

    dom.calendarEmpty.hidden = hasData;
    dom.calendarContent.hidden = !hasData;

    if (!hasData) {
      dom.calendarFilterWrap.hidden = true;
      dom.calendarContent.innerHTML = '';
      renderCalendarStats();
      return;
    }

    if (state.calendarFilter !== 'all' && !groups.some((group) => group.key === state.calendarFilter)) {
      state.calendarFilter = 'all';
    }

    const filterNeeded = groups.length > 1;
    dom.calendarFilterWrap.hidden = !filterNeeded;
    if (filterNeeded) {
      dom.calendarFilter.innerHTML =
        '<option value="all">Tüm zamanlar</option>' +
        groups.map((group) => `<option value="${group.key}">${monthLabelFromKey(group.key)}</option>`).join('');
      dom.calendarFilter.value = state.calendarFilter;
    } else {
      dom.calendarFilter.innerHTML = '<option value="all">Tüm zamanlar</option>';
      state.calendarFilter = 'all';
    }

    const visibleGroups = state.calendarFilter === 'all' ? groups : groups.filter((group) => group.key === state.calendarFilter);

    dom.calendarContent.innerHTML = visibleGroups
      .map(
        (group) => `<section class="month-group" aria-label="${monthLabelFromKey(group.key)}">
          <div class="month-heading">
            <h2>${monthLabelFromKey(group.key)}</h2>
            <span>${group.segments.length} hafta</span>
          </div>
          <div class="weeks-grid">${group.segments.map(renderWeekCard).join('')}</div>
        </section>`
      )
      .join('');

    renderCalendarStats();
  }

  function renderCalendarStats() {
    const keys = Object.keys(state.workData);
    const totalMinutes = keys.reduce((sum, key) => sum + Math.round(state.workData[key] * 60), 0);
    const today = todayDate();
    const monday = startOfWeek(today);
    let weekMinutes = 0;
    for (let index = 0; index < 6; index += 1) {
      weekMinutes += Math.round((state.workData[toDateKey(addDays(monday, index))] || 0) * 60);
    }

    dom.statDays.textContent = `${keys.length} gün`;
    dom.statTotal.textContent = formatMinutes(totalMinutes);
    dom.statWeek.innerHTML = `${formatMinutes(weekMinutes)} <small>/ ${formatMinutes(40 * 60)}</small>`;
  }

  function goToCurrentWeek() {
    if (state.calendarFilter !== 'all') {
      state.calendarFilter = 'all';
      renderCalendar();
    }
    window.requestAnimationFrame(() => {
      const current = $('.week-card.is-current');
      if (current) {
        current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  /* ---------- Settings ---------- */

  function renderSettingsData() {
    const count = countWorkDays(state.workData);
    if (!count) {
      dom.dataMeta.textContent = 'Henüz kayıt yok';
      dom.clearDataBtn.disabled = true;
      return;
    }
    dom.clearDataBtn.disabled = false;
    const json = JSON.stringify(state.workData);
    const bytes = new Blob([json]).size;
    const size = bytes < 1024
      ? `${bytes} bayt`
      : `${(bytes / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} KB`;
    dom.dataMeta.textContent = `${count} gün kayıtlı · ${size}`;
  }

  function updateReminderUi() {
    dom.remindersToggle.checked = state.reminders.enabled;
    dom.reminderOptions.hidden = !state.reminders.enabled;
    dom.reminderTime.value = state.reminders.time;
    updatePermissionUi();
  }

  function notificationSupport() {
    return 'Notification' in window;
  }

  function permissionState() {
    if (!notificationSupport()) return 'unsupported';
    return Notification.permission;
  }

  function updatePermissionUi() {
    if (!dom.permissionStatus) return;
    const permission = permissionState();
    const labels = {
      granted: 'Bildirim izni verildi.',
      default: 'Bildirim izni henüz verilmedi.',
      denied: 'Bildirim izni engellendi. Tarayıcı ayarlarından izin verebilirsiniz.',
      unsupported: 'Bu tarayıcı bildirimleri desteklemiyor.'
    };
    dom.permissionStatus.textContent = labels[permission];
    dom.permissionStatus.dataset.state = permission;
    dom.permissionBtn.hidden = permission !== 'default';
    dom.testNotificationBtn.disabled = false;
  }

  async function requestNotificationPermission() {
    if (!notificationSupport()) {
      showToast('Bu tarayıcı bildirimleri desteklemiyor. Hatırlatıcı sayfa içinde gösterilecek.', { type: 'info' });
      return 'unsupported';
    }
    try {
      const permission = await Notification.requestPermission();
      updatePermissionUi();
      if (permission === 'granted') {
        showToast('Bildirim izni verildi.', { type: 'success' });
      } else if (permission === 'denied') {
        showToast('Bildirim izni verilmedi. Hatırlatıcılar sayfa açıkken uygulama içinde gösterilecek.', { type: 'info', duration: 6000 });
      }
      return permission;
    } catch (error) {
      updatePermissionUi();
      showToast('Bildirim izni istenirken bir sorun oluştu.', { type: 'error' });
      return 'default';
    }
  }

  async function showBrowserNotification(title, body) {
    if (!notificationSupport() || Notification.permission !== 'granted') return false;
    const icon = new URL('./icons/icon-192.png', document.baseURI).href;
    const badge = new URL('./icons/favicon-48.png', document.baseURI).href;
    const options = {
      body,
      icon,
      badge,
      tag: 'horalator-reminder',
      renotify: true,
      data: { url: new URL('./', document.baseURI).href }
    };

    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.showNotification(title, options);
          return true;
        }
      }
      const notification = new Notification(title, options);
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      return true;
    } catch (error) {
      try {
        const notification = new Notification(title, options);
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
        return true;
      } catch (fallbackError) {
        return false;
      }
    }
  }

  async function showReminder() {
    const message = 'Bugünkü mesai saatini girmeyi unutmayın!';
    const shown = await showBrowserNotification('Horalator Hatırlatıcı', message);
    if (!shown) {
      showToast(message, {
        type: 'info',
        duration: 7000,
        actionLabel: 'Günlük’e git',
        action: () => setTab('daily')
      });
    }
  }

  function checkReminder() {
    if (!state.reminders.enabled) return;
    const now = new Date();
    if (now.getDay() === 0 || now.getDay() === 6) return;
    const todayKey = toDateKey(now);
    if (state.workData[todayKey]) return;

    const parts = state.reminders.time.split(':');
    const targetMinutes = Number(parts[0]) * 60 + Number(parts[1]);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (nowMinutes < targetMinutes) return;

    if (readStorage(STORAGE.reminderLast) === todayKey) return;
    writeStorage(STORAGE.reminderLast, todayKey);
    showReminder();
  }

  async function testNotification() {
    let permission = permissionState();
    if (permission === 'default') permission = await requestNotificationPermission();
    if (permission === 'granted') {
      const shown = await showBrowserNotification('Horalator Test Bildirimi', 'Bildirimler çalışıyor. Mesai hatırlatıcınız hazır.');
      if (shown) {
        showToast('Test bildirimi gönderildi.', { type: 'success' });
        return;
      }
    }
    showToast('Bildirim gönderilemedi; bunun yerine sayfa içi hatırlatıcı gösteriliyor.', { type: 'info' });
  }

  function exportData() {
    const count = countWorkDays(state.workData);
    if (!count) {
      showToast('Dışa aktarılacak kayıt yok.', { type: 'info' });
      return;
    }
    const sorted = {};
    Object.keys(state.workData)
      .sort()
      .forEach((key) => {
        sorted[key] = state.workData[key];
      });
    const json = JSON.stringify(sorted, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'horalator_backup.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast(`${count} günlük veri dışa aktarıldı.`, { type: 'success' });
  }

  async function importFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('Dosya çok büyük. En fazla 5 MB olan bir yedek seçin.', { type: 'error' });
      return;
    }

    try {
      const text = await file.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw new Error('Dosya geçerli bir JSON yedeği değil.');
      }

      const { data, skipped } = sanitizeData(parsed);
      const count = countWorkDays(data);
      if (!count) {
        throw new Error('Dosyada geçerli mesai kaydı bulunamadı.');
      }

      if (countWorkDays(state.workData) > 0) {
        const proceed = await confirmAction({
          title: 'Mevcut veriler değiştirilsin mi?',
          message: `${count} günlük kayıt içe aktarılacak. Bu cihazdaki ${countWorkDays(state.workData)} günlük kayıt bu verilerle değiştirilecek.`,
          confirmLabel: 'İçe aktar'
        });
        if (!proceed) {
          showToast('İçe aktarma iptal edildi.', { type: 'info' });
          return;
        }
      }

      state.workData = data;
      state.calendarFilter = 'all';
      saveWorkData();
      renderAllDataDependent();
      const skippedText = skipped > 0 ? ` ${skipped} geçersiz kayıt atlandı.` : '';
      showToast(`${count} günlük kayıt içe aktarıldı.${skippedText}`, { type: 'success', duration: 6000 });
    } catch (error) {
      showToast(`İçe aktarma hatası: ${error.message}`, { type: 'error', duration: 6500 });
    }
  }

  async function clearAllData() {
    const proceed = await confirmAction({
      title: 'Tüm kayıtlar silinsin mi?',
      message: 'Takvimdeki tüm mesai kayıtları bu tarayıcıdan silinecek. Bu işlem geri alınamaz.',
      confirmLabel: 'Tümünü sil'
    });
    if (!proceed) return;

    state.workData = {};
    state.calendarFilter = 'all';
    removeStorage(STORAGE.workData);
    renderAllDataDependent();
    showToast('Tüm mesai kayıtları silindi.', { type: 'success' });
  }

  /* ---------- Dialogs and toasts ---------- */

  function openDialog(dialog) {
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }

  function closeDialog(dialog) {
    if (dialog && dialog.open) dialog.close('cancel');
  }

  function setupDialogs() {
    $$('[data-close-dialog]').forEach((button) => {
      button.addEventListener('click', () => {
        closeDialog(document.getElementById(button.dataset.closeDialog));
      });
    });

    $$('dialog').forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const clickedInside =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;
        if (!clickedInside) dialog.close('cancel');
      });
    });

    dom.confirmDialog.addEventListener('close', () => {
      if (state.confirmResolver) {
        const resolve = state.confirmResolver;
        state.confirmResolver = null;
        resolve(dom.confirmDialog.returnValue === 'confirm');
      }
    });

    dom.confirmOk.addEventListener('click', () => dom.confirmDialog.close('confirm'));
    dom.confirmCancel.addEventListener('click', () => dom.confirmDialog.close('cancel'));
  }

  function confirmAction(options = {}) {
    if (state.confirmResolver) {
      const previous = state.confirmResolver;
      state.confirmResolver = null;
      previous(false);
    }
    if (dom.confirmDialog.open) dom.confirmDialog.close('cancel');

    dom.confirmTitle.textContent = options.title || 'Emin misiniz?';
    dom.confirmMessage.textContent = options.message || '';
    dom.confirmOk.textContent = options.confirmLabel || 'Onayla';
    dom.confirmOk.className = options.danger === false ? 'btn btn-primary' : 'btn btn-danger';
    dom.confirmDialog.returnValue = 'cancel';

    return new Promise((resolve) => {
      state.confirmResolver = resolve;
      dom.confirmDialog.showModal();
    });
  }

  function showToast(message, options = {}) {
    const type = options.type || 'success';
    const iconId = type === 'error' ? 'icon-alert-circle' : type === 'info' ? 'icon-info-circle' : 'icon-check-circle';
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.dataset.type = type;
    toast.innerHTML = `<span class="toast-icon"><svg class="icon" aria-hidden="true"><use href="#${iconId}"/></svg></span>
      <div class="toast-body"><span class="toast-message"></span>${options.actionLabel ? '<button class="toast-action" type="button"></button>' : ''}</div>`;
    toast.querySelector('.toast-message').textContent = message;

    const remove = () => {
      if (toast.classList.contains('is-leaving')) return;
      toast.classList.add('is-leaving');
      window.setTimeout(() => toast.remove(), 240);
    };

    const actionButton = toast.querySelector('.toast-action');
    if (actionButton) {
      actionButton.textContent = options.actionLabel;
      actionButton.addEventListener('click', () => {
        if (typeof options.action === 'function') options.action();
        remove();
      });
    }

    const region = dom.toastRegion;
    while (region.children.length >= 4) region.firstElementChild.remove();
    region.appendChild(toast);

    window.setTimeout(remove, options.duration || (type === 'error' ? 6000 : 4400));
  }

  /* ---------- Add-to-calendar dialog ---------- */

  function defaultAddDate() {
    const today = todayDate();
    return today.getDay() === 0 ? addDays(today, 1) : today;
  }

  function setAddDate(date) {
    dom.addDate.value = toDateKey(date);
    updateAddDateUi();
  }

  function updateAddDateUi() {
    const date = fromDateKey(dom.addDate.value);
    const today = todayDate();
    const quickButtons = $$('#addDateQuick [data-day-offset]');

    if (!date) {
      dom.addDateLabel.textContent = 'Geçerli bir gün seçin.';
      dom.addError.textContent = '';
      dom.addSubmit.disabled = true;
      dom.addExisting.textContent = '';
      quickButtons.forEach((button) => {
        button.disabled = false;
      });
      return;
    }

    const isSunday = date.getDay() === 0;
    dom.addDateLabel.textContent = formatDateLong(date);
    dom.addError.textContent = isSunday ? 'Pazar günleri takvime kayıt eklenemez.' : '';
    dom.addSubmit.disabled = isSunday || state.currentNetMinutes <= 0;

    quickButtons.forEach((button) => {
      const offset = Number(button.dataset.dayOffset);
      const quickDate = addDays(today, offset);
      button.disabled = quickDate.getDay() === 0;
      button.classList.toggle('is-active', toDateKey(quickDate) === toDateKey(date));
    });

    const key = toDateKey(date);
    const existingHours = state.workData[key] || 0;
    if (existingHours > 0) {
      dom.addExisting.className = 'existing-note is-warning';
      dom.addExisting.textContent = `Bu günde ${formatDuration(existingHours)} kayıt var. Kaydedince üzerine yazılacak.`;
    } else {
      dom.addExisting.className = 'existing-note';
      dom.addExisting.textContent = '';
    }
  }

  function openAddDialog() {
    if (state.currentNetMinutes <= 0) return;
    dom.addDuration.textContent = formatMinutes(state.currentNetMinutes);
    dom.addError.textContent = '';
    setAddDate(defaultAddDate());
    openDialog(dom.addDialog);
    window.setTimeout(() => {
      try {
        dom.addDate.focus({ preventScroll: true });
      } catch (error) {
        dom.addDate.focus();
      }
    }, 60);
  }

  function submitAddDialog(event) {
    event.preventDefault();
    const date = fromDateKey(dom.addDate.value);
    if (!date) {
      dom.addError.textContent = 'Lütfen geçerli bir gün seçin.';
      return;
    }
    if (date.getDay() === 0) {
      dom.addError.textContent = 'Pazar günleri takvime kayıt eklenemez.';
      return;
    }
    if (state.currentNetMinutes <= 0) {
      dom.addError.textContent = 'Eklenecek geçerli bir mesai süresi yok.';
      return;
    }

    const key = toDateKey(date);
    const minutes = state.currentNetMinutes;
    state.workData[key] = roundHours(minutes);
    rememberTimes();
    if (!saveWorkData()) return;

    closeDialog(dom.addDialog);
    renderAllDataDependent();
    showToast(`${formatDateLong(date)} için ${formatMinutes(minutes)} takvime eklendi.`, {
      type: 'success',
      duration: 6000,
      actionLabel: 'Takvimi aç',
      action: () => setTab('calendar')
    });
  }

  /* ---------- Edit-day dialog ---------- */

  function openEditDialog(key) {
    const date = fromDateKey(key);
    if (!date) return;
    state.editingDate = key;
    const hours = state.workData[key] || 0;
    const minutes = Math.round(hours * 60);

    dom.editTitle.textContent = 'Günü düzenle';
    dom.editDate.textContent = formatDateLong(date);
    dom.editDuration.value = minutes > 0 ? formatMinutes(minutes) : '';
    dom.editError.textContent = '';
    dom.editDelete.hidden = minutes <= 0;
    openDialog(dom.editDialog);

    window.setTimeout(() => {
      try {
        dom.editDuration.focus({ preventScroll: true });
        dom.editDuration.select();
      } catch (error) {
        dom.editDuration.focus();
        dom.editDuration.select();
      }
    }, 80);
  }

  function submitEditDialog(event) {
    event.preventDefault();
    if (!state.editingDate) return;
    const minutes = parseDuration(dom.editDuration.value);
    if (minutes === null) {
      dom.editError.textContent = 'Geçerli bir süre girin. Örnek: 08:30';
      return;
    }
    if (minutes === 0) {
      delete state.workData[state.editingDate];
    } else {
      state.workData[state.editingDate] = roundHours(minutes);
    }
    if (!saveWorkData()) return;
    const date = fromDateKey(state.editingDate);
    closeDialog(dom.editDialog);
    state.editingDate = null;
    renderAllDataDependent();
    if (minutes === 0) {
      showToast(`${date ? formatDateLong(date) : 'Gün'} kaydı silindi.`, { type: 'success' });
    } else {
      showToast(`${date ? formatDateLong(date) : 'Gün'} ${formatMinutes(minutes)} olarak güncellendi.`, { type: 'success' });
    }
  }

  async function deleteEditingDay() {
    if (!state.editingDate) return;
    const date = fromDateKey(state.editingDate);
    const proceed = await confirmAction({
      title: 'Kayıt silinsin mi?',
      message: date ? `${formatDateLong(date)} gününe ait kayıt silinecek.` : 'Bu günün kaydı silinecek.',
      confirmLabel: 'Sil'
    });
    if (!proceed || !state.editingDate) return;

    const key = state.editingDate;
    delete state.workData[key];
    saveWorkData();
    closeDialog(dom.editDialog);
    state.editingDate = null;
    renderAllDataDependent();
    showToast('Kayıt silindi.', { type: 'success' });
  }

  /* ---------- Rendering helpers ---------- */

  function renderAllDataDependent() {
    renderWeekSnapshot();
    renderCalendar();
    renderSettingsData();
  }

  /* ---------- Service worker and install ---------- */

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(window.location.protocol)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((error) => {
        console.warn('Service worker kaydı başarısız:', error);
      });
    });
  }

  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      state.installPrompt = event;
      dom.installRow.hidden = false;
    });

    window.addEventListener('appinstalled', () => {
      state.installPrompt = null;
      dom.installRow.hidden = true;
      showToast('Horalator ana ekrana eklendi.', { type: 'success' });
    });

    dom.installBtn.addEventListener('click', async () => {
      if (!state.installPrompt) return;
      state.installPrompt.prompt();
      try {
        await state.installPrompt.userChoice;
      } catch (error) {
        /* The prompt can be dismissed by the browser. */
      }
      state.installPrompt = null;
      dom.installRow.hidden = true;
    });
  }

  async function refreshApp() {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.update()));
      }
    } catch (error) {
      /* A normal reload still works if updating fails. */
    }
    window.location.reload();
  }

  /* ---------- Event wiring ---------- */

  function cacheDom() {
    dom.themeToggle = $('#themeToggle');
    dom.todayPillText = $('#todayPillText');
    dom.dailyForm = $('#dailyForm');
    dom.startTime = $('#startTime');
    dom.endTime = $('#endTime');
    dom.dinnerRow = $('#dinnerRow');
    dom.dinnerToggle = $('#dinnerToggle');
    dom.dinnerHint = $('#dinnerHint');
    dom.calcNote = $('#calcNote');
    dom.addToCalendarBtn = $('#addToCalendarBtn');
    dom.netTime = $('#netTime');
    dom.grossTime = $('#grossTime');
    dom.breakTime = $('#breakTime');
    dom.targetDelta = $('#targetDelta');
    dom.breakDetail = $('#breakDetail');
    dom.resultNote = $('#resultNote');
    dom.resultStatus = $('#resultStatus');
    dom.statusChip = dom.resultStatus;
    dom.ringValue = $('#ringValue');
    dom.weekRange = $('#weekRange');
    dom.weekTotal = $('#weekTotal');
    dom.weekTarget = $('#weekTarget');
    dom.weekDayCount = $('#weekDayCount');
    dom.weekDelta = $('#weekDelta');
    dom.weekProgress = $('#weekProgress');
    dom.weekProgressBar = $('#weekProgressBar');
    dom.weekMiniDays = $('#weekMiniDays');
    dom.calendarContent = $('#calendarContent');
    dom.calendarEmpty = $('#calendarEmpty');
    dom.calendarFilterWrap = $('#calendarFilterWrap');
    dom.calendarFilter = $('#calendarFilter');
    dom.calendarTodayBtn = $('#calendarTodayBtn');
    dom.statDays = $('#statDays');
    dom.statTotal = $('#statTotal');
    dom.statWeek = $('#statWeek');
    dom.dataMeta = $('#dataMeta');
    dom.clearDataBtn = $('#clearDataBtn');
    dom.exportBtn = $('#exportBtn');
    dom.importBtn = $('#importBtn');
    dom.importFile = $('#importFile');
    dom.remindersToggle = $('#remindersToggle');
    dom.reminderOptions = $('#reminderOptions');
    dom.reminderTime = $('#reminderTime');
    dom.permissionStatus = $('#permissionStatus');
    dom.permissionBtn = $('#permissionBtn');
    dom.testNotificationBtn = $('#testNotificationBtn');
    dom.installRow = $('#installRow');
    dom.installBtn = $('#installBtn');
    dom.refreshAppBtn = $('#refreshAppBtn');
    dom.toastRegion = $('#toastRegion');
    dom.addDialog = $('#addDialog');
    dom.addForm = $('#addForm');
    dom.addDate = $('#addDate');
    dom.addDateLabel = $('#addDateLabel');
    dom.addError = $('#addError');
    dom.addExisting = $('#addExisting');
    dom.addDuration = $('#addDuration');
    dom.addSubmit = $('#addSubmit');
    dom.editDialog = $('#editDialog');
    dom.editForm = $('#editForm');
    dom.editTitle = $('#editTitle');
    dom.editDate = $('#editDate');
    dom.editDuration = $('#editDuration');
    dom.editError = $('#editError');
    dom.editDelete = $('#editDelete');
    dom.confirmDialog = $('#confirmDialog');
    dom.confirmTitle = $('#confirmTitle');
    dom.confirmMessage = $('#confirmMessage');
    dom.confirmOk = $('#confirmOk');
    dom.confirmCancel = $('#confirmCancel');
  }

  function setupEvents() {
    $$('[data-tab]').forEach((element) => {
      element.addEventListener('click', (event) => {
        event.preventDefault();
        setTab(element.dataset.tab);
      });
    });

    dom.themeToggle.addEventListener('click', () => {
      const current = getEffectiveTheme(state.themeSetting);
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    $$('input[name="theme"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        if (radio.checked) applyTheme(radio.value);
      });
    });

    const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemTheme = () => {
      if (state.themeSetting === 'system') applyTheme('system', false);
    };
    if (typeof systemThemeQuery.addEventListener === 'function') {
      systemThemeQuery.addEventListener('change', handleSystemTheme);
    } else if (typeof systemThemeQuery.addListener === 'function') {
      systemThemeQuery.addListener(handleSystemTheme);
    }

    dom.dailyForm.addEventListener('submit', (event) => {
      event.preventDefault();
      openAddDialog();
    });

    dom.startTime.addEventListener('input', updateDaily);
    dom.endTime.addEventListener('input', updateDaily);
    dom.startTime.addEventListener('change', () => {
      updateDaily();
      rememberTimes();
    });
    dom.endTime.addEventListener('change', () => {
      updateDaily();
      rememberTimes();
    });
    dom.dinnerToggle.addEventListener('change', updateDaily);

    $$('.preset-row [data-start][data-end]').forEach((button) => {
      button.addEventListener('click', () => {
        dom.startTime.value = button.dataset.start;
        dom.endTime.value = button.dataset.end;
        updateDaily();
        rememberTimes();
        dom.startTime.focus();
      });
    });

    dom.addForm.addEventListener('submit', submitAddDialog);
    dom.addDate.addEventListener('change', updateAddDateUi);
    $$('#addDateQuick [data-day-offset]').forEach((button) => {
      button.addEventListener('click', () => {
        setAddDate(addDays(todayDate(), Number(button.dataset.dayOffset)));
      });
    });

    dom.editForm.addEventListener('submit', submitEditDialog);
    dom.editDuration.addEventListener('input', () => {
      dom.editError.textContent = '';
    });
    dom.editDuration.addEventListener('blur', () => {
      const minutes = parseDuration(dom.editDuration.value);
      if (minutes !== null) dom.editDuration.value = formatMinutes(minutes);
    });
    $$('#editQuick [data-duration]').forEach((button) => {
      button.addEventListener('click', () => {
        dom.editDuration.value = button.dataset.duration;
        dom.editError.textContent = '';
        dom.editDuration.focus();
      });
    });
    dom.editDelete.addEventListener('click', deleteEditingDay);

    dom.addDialog.addEventListener('close', () => {
      dom.addError.textContent = '';
    });
    dom.editDialog.addEventListener('close', () => {
      state.editingDate = null;
      dom.editError.textContent = '';
    });

    dom.calendarContent.addEventListener('click', (event) => {
      const tile = event.target.closest('[data-date]');
      if (tile) openEditDialog(tile.dataset.date);
    });
    dom.calendarFilter.addEventListener('change', () => {
      state.calendarFilter = dom.calendarFilter.value;
      renderCalendar();
    });
    dom.calendarTodayBtn.addEventListener('click', goToCurrentWeek);

    dom.exportBtn.addEventListener('click', exportData);
    dom.importBtn.addEventListener('click', () => dom.importFile.click());
    dom.importFile.addEventListener('change', async () => {
      const file = dom.importFile.files && dom.importFile.files[0];
      dom.importFile.value = '';
      await importFile(file);
    });
    dom.clearDataBtn.addEventListener('click', clearAllData);

    dom.remindersToggle.addEventListener('change', async () => {
      state.reminders.enabled = dom.remindersToggle.checked;
      writeStorage(STORAGE.reminderEnabled, String(state.reminders.enabled));
      updateReminderUi();
      if (state.reminders.enabled) {
        showToast('Günlük hatırlatıcı açıldı.', { type: 'success' });
        if (permissionState() === 'default') await requestNotificationPermission();
        window.setTimeout(checkReminder, 700);
      } else {
        showToast('Günlük hatırlatıcı kapatıldı.', { type: 'info' });
      }
    });

    dom.reminderTime.addEventListener('change', () => {
      if (!dom.reminderTime.value) {
        dom.reminderTime.value = '18:00';
      }
      state.reminders.time = dom.reminderTime.value;
      writeStorage(STORAGE.reminderTime, state.reminders.time);
      showToast(`Hatırlatma saati ${state.reminders.time} olarak ayarlandı.`, { type: 'success' });
    });

    dom.permissionBtn.addEventListener('click', requestNotificationPermission);
    dom.testNotificationBtn.addEventListener('click', testNotification);
    dom.refreshAppBtn.addEventListener('click', refreshApp);

    window.addEventListener('hashchange', () => {
      const tab = window.location.hash.replace('#', '');
      if (['daily', 'calendar', 'settings'].includes(tab)) {
        setTab(tab, { updateHash: false, scroll: false });
      }
    });

    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE.workData) {
        state.workData = loadWorkData();
        renderAllDataDependent();
        showToast('Veriler başka bir sekmede güncellendi.', { type: 'info' });
      } else if (event.key === STORAGE.theme) {
        state.themeSetting = readStorage(STORAGE.theme) || 'system';
        applyTheme(state.themeSetting, false);
      } else if (event.key === STORAGE.reminderEnabled || event.key === STORAGE.reminderTime) {
        state.reminders = loadReminderSettings();
        updateReminderUi();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      const currentDate = toDateKey(new Date());
      if (currentDate !== state.lastRenderDate) {
        state.lastRenderDate = currentDate;
        updateTodayUi();
        renderAllDataDependent();
      }
      updatePermissionUi();
      checkReminder();
    });

    window.setInterval(() => {
      const currentDate = toDateKey(new Date());
      if (currentDate !== state.lastRenderDate) {
        state.lastRenderDate = currentDate;
        updateTodayUi();
        renderAllDataDependent();
      }
    }, 60000);

    window.setInterval(checkReminder, 30000);
  }

  /* ---------- Init ---------- */

  function init() {
    cacheDom();
    setupDialogs();

    state.workData = loadWorkData();
    state.themeSetting = readStorage(STORAGE.theme) || 'system';
    state.reminders = loadReminderSettings();
    state.lastRenderDate = toDateKey(new Date());

    applyTheme(state.themeSetting, false);

    const lastStart = readStorage(STORAGE.lastStart);
    const lastEnd = readStorage(STORAGE.lastEnd);
    if (lastStart && /^\d{2}:\d{2}$/.test(lastStart)) dom.startTime.value = lastStart;
    if (lastEnd && /^\d{2}:\d{2}$/.test(lastEnd)) dom.endTime.value = lastEnd;

    dom.addDate.min = '2020-01-01';
    dom.addDate.max = '2100-12-31';

    setupEvents();
    updateTodayUi();
    updateDaily();
    updateReminderUi();
    updatePermissionUi();
    renderAllDataDependent();
    setupInstallPrompt();
    registerServiceWorker();

    const initialTab = window.location.hash.replace('#', '');
    setTab(['daily', 'calendar', 'settings'].includes(initialTab) ? initialTab : 'daily', {
      updateHash: false,
      scroll: false
    });

    if (!storageIsAvailable()) {
      showToast('Tarayıcı depolaması kullanılamıyor. Kayıtlar kalıcı olmayabilir.', { type: 'error', duration: 7000 });
    }

    window.setTimeout(() => {
      if (state.reminders.enabled) checkReminder();
    }, 1800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
