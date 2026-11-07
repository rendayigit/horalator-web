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
    lastEnd: 'horalator.lastEnd',
    frequentPresets: 'horalator.frequentPresets.v1',
    frequentDurations: 'horalator.frequentDurations.v1'
  };

  const WEEKDAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const WEEKDAYS_LONG = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const TARGET_MINUTES = 8 * 60;
  const DEFAULT_PRESETS = [
    { start: '08:00', end: '17:00' },
    { start: '09:00', end: '18:00' }
  ];
  const DEFAULT_DURATIONS = [4 * 60, 8 * 60, 8 * 60 + 30, 9 * 60];
  const MIN_FREQUENT_USES = 2;
  const MAX_VISIBLE_FREQUENT_PRESETS = 3;
  const MAX_STORED_FREQUENT_PRESETS = 8;

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
    frequentPresets: [],
    frequentDurations: [],
    calendarFilter: 'all',
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

  function parseTimeOfDay(value) {
    if (typeof value !== 'string') return null;
    let text = value.trim();
    if (!text) return null;
    text = text.replace(/\s+/g, '').replace(/[.,;]/g, ':');

    if (text.includes(':')) {
      const parts = text.split(':');
      if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[0]) || !/^\d{0,2}$/.test(parts[1])) return null;
      const hours = Number(parts[0]);
      const minutes = parts[1] === '' ? 0 : Number(parts[1]);
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
      return { hours, minutes, totalMinutes: hours * 60 + minutes };
    }

    if (/^\d{1,2}$/.test(text)) {
      const hours = Number(text);
      if (hours < 0 || hours > 23) return null;
      return { hours, minutes: 0, totalMinutes: hours * 60 };
    }

    if (/^\d{3,4}$/.test(text)) {
      const padded = text.padStart(4, '0');
      const hours = Number(padded.slice(0, 2));
      const minutes = Number(padded.slice(2));
      if (hours > 23 || minutes > 59) return null;
      return { hours, minutes, totalMinutes: hours * 60 + minutes };
    }

    return null;
  }

  function formatTimeOfDay(value) {
    const parsed = parseTimeOfDay(value);
    return parsed ? `${pad2(parsed.hours)}:${pad2(parsed.minutes)}` : null;
  }

  function parseDuration(value) {
    if (typeof value !== 'string') return null;
    let text = value.trim().replace(/\s+/g, '').replace(/[.,;]/g, ':');
    if (!text) return null;

    if (text.includes(':')) {
      const parts = text.split(':');
      if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[0]) || !/^\d{0,2}$/.test(parts[1])) return null;
      const hours = Number(parts[0]);
      const minutes = parts[1] === '' ? 0 : Number(parts[1]);
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
    const parsed = parseTimeOfDay(value);
    if (!parsed) return null;

    // Mirrors the Android app's workplace rounding rules.
    const roundedStart = parsed.hours === 7;
    const roundedEnd = parsed.hours === 17;
    const adjusted = roundedStart ? 8 * 60 : roundedEnd ? 17 * 60 : parsed.totalMinutes;
    return {
      minutes: parsed.totalMinutes,
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

  function presetKey(start, end) {
    return `${start}|${end}`;
  }

  function sanitizeFrequentPresets(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const start = formatTimeOfDay(item.start);
        const end = formatTimeOfDay(item.end);
        const count = Math.round(Number(item.count));
        const lastUsed = Number(item.lastUsed);
        if (!start || !end || !Number.isFinite(count) || count <= 0) return null;
        const key = presetKey(start, end);
        if (seen.has(key)) return null;
        seen.add(key);
        return { start, end, count, lastUsed: Number.isFinite(lastUsed) ? lastUsed : 0 };
      })
      .filter(Boolean)
      .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)
      .slice(0, MAX_STORED_FREQUENT_PRESETS);
  }

  function loadFrequentPresets() {
    const stored = readStorage(STORAGE.frequentPresets);
    if (!stored) return [];
    try {
      return sanitizeFrequentPresets(JSON.parse(stored));
    } catch (error) {
      return [];
    }
  }

  function saveFrequentPresets() {
    writeStorage(STORAGE.frequentPresets, JSON.stringify(state.frequentPresets));
  }

  function recordPresetUsage(startValue, endValue) {
    const start = formatTimeOfDay(startValue);
    const end = formatTimeOfDay(endValue);
    if (!start || !end) return;

    const key = presetKey(start, end);
    if (DEFAULT_PRESETS.some((preset) => presetKey(preset.start, preset.end) === key)) return;

    const existing = state.frequentPresets.find((preset) => presetKey(preset.start, preset.end) === key);
    if (existing) {
      existing.count += 1;
      existing.lastUsed = Date.now();
    } else {
      state.frequentPresets.push({ start, end, count: 1, lastUsed: Date.now() });
    }

    state.frequentPresets = state.frequentPresets
      .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)
      .slice(0, MAX_STORED_FREQUENT_PRESETS);
    saveFrequentPresets();
    renderQuickPresets();
  }

  function clearFrequentPresets() {
    if (!state.frequentPresets.length) return;
    state.frequentPresets = [];
    removeStorage(STORAGE.frequentPresets);
    renderQuickPresets();
    showToast('Sık kullanılan saatler temizlendi.', { type: 'info' });
  }

  function presetRangeNetMinutes(startValue, endValue) {
    const start = parseClock(startValue);
    const end = parseClock(endValue);
    if (!start || !end) return null;
    const net = calculateWork(start, end, false).net;
    return net > 0 ? net : null;
  }

  function renderQuickPresets() {
    if (!dom.quickPresetChips) return;
    const defaultKeys = new Set(DEFAULT_PRESETS.map((preset) => presetKey(preset.start, preset.end)));
    const frequent = state.frequentPresets
      .filter((preset) => preset.count >= MIN_FREQUENT_USES && !defaultKeys.has(presetKey(preset.start, preset.end)))
      .slice(0, MAX_VISIBLE_FREQUENT_PRESETS);

    const buildChip = (preset, count) => {
      const net = presetRangeNetMinutes(preset.start, preset.end);
      const netText = net ? `${formatMinutes(net)} net` : '';
      const isFrequent = Number.isFinite(count);
      const title = isFrequent
        ? `Sık kullanılan · ${count} kez${netText ? ` · ${netText}` : ''}`
        : netText;
      const ariaLabel = isFrequent
        ? `${preset.start} – ${preset.end}, sık kullanılan, ${count} kez${netText ? `, ${netText}` : ''}`
        : `${preset.start} – ${preset.end}${netText ? `, ${netText}` : ''}`;
      const star = isFrequent
        ? '<svg class="icon" aria-hidden="true"><use href="#icon-star"/></svg>'
        : '';
      return `<button class="chip preset-chip${isFrequent ? ' is-frequent' : ''}" type="button" data-start="${preset.start}" data-end="${preset.end}" title="${title}" aria-label="${ariaLabel}">${star}${preset.start} – ${preset.end}</button>`;
    };

    const chips = frequent.map((preset) => buildChip(preset, preset.count));
    DEFAULT_PRESETS.forEach((preset) => chips.push(buildChip(preset)));

    dom.quickPresetChips.innerHTML = chips.join('');
    if (dom.clearPresetsBtn) dom.clearPresetsBtn.hidden = frequent.length === 0;
  }

  function sanitizeFrequentDurations(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const minutes = Math.round(Number(item.minutes));
        const count = Math.round(Number(item.count));
        const lastUsed = Number(item.lastUsed);
        if (!Number.isFinite(minutes) || minutes <= 0 || minutes >= 24 * 60) return null;
        if (!Number.isFinite(count) || count <= 0) return null;
        if (seen.has(minutes)) return null;
        seen.add(minutes);
        return { minutes, count, lastUsed: Number.isFinite(lastUsed) ? lastUsed : 0 };
      })
      .filter(Boolean)
      .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)
      .slice(0, MAX_STORED_FREQUENT_PRESETS);
  }

  function loadFrequentDurations() {
    const stored = readStorage(STORAGE.frequentDurations);
    if (!stored) return [];
    try {
      return sanitizeFrequentDurations(JSON.parse(stored));
    } catch (error) {
      return [];
    }
  }

  function saveFrequentDurations() {
    writeStorage(STORAGE.frequentDurations, JSON.stringify(state.frequentDurations));
  }

  function recordDurationUsage(minutes) {
    const value = Math.round(Number(minutes));
    if (!Number.isFinite(value) || value <= 0) return;
    if (DEFAULT_DURATIONS.includes(value)) return;

    const existing = state.frequentDurations.find((item) => item.minutes === value);
    if (existing) {
      existing.count += 1;
      existing.lastUsed = Date.now();
    } else {
      state.frequentDurations.push({ minutes: value, count: 1, lastUsed: Date.now() });
    }

    state.frequentDurations = state.frequentDurations
      .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)
      .slice(0, MAX_STORED_FREQUENT_PRESETS);
    saveFrequentDurations();
    renderDurationPresets();
  }

  function clearFrequentDurations() {
    if (!state.frequentDurations.length) return;
    state.frequentDurations = [];
    removeStorage(STORAGE.frequentDurations);
    renderDurationPresets();
    showToast('Sık kullanılan süreler temizlendi.', { type: 'info' });
  }

  function renderDurationPresets() {
    const frequent = state.frequentDurations
      .filter((item) => item.count >= MIN_FREQUENT_USES && !DEFAULT_DURATIONS.includes(item.minutes))
      .slice(0, MAX_VISIBLE_FREQUENT_PRESETS);

    const buildChip = (minutes, count) => {
      const label = formatMinutes(minutes);
      const isFrequent = Number.isFinite(count);
      const title = isFrequent ? `Sık kullanılan · ${count} kez` : label;
      const star = isFrequent
        ? '<svg class="icon" aria-hidden="true"><use href="#icon-star"/></svg>'
        : '';
      return `<button class="chip preset-chip${isFrequent ? ' is-frequent' : ''}" type="button" data-duration="${label}" title="${title}" aria-label="${label}${isFrequent ? `, sık kullanılan, ${count} kez` : ''}">${star}${label}</button>`;
    };

    const chips = frequent.map((item) => buildChip(item.minutes, item.count));
    DEFAULT_DURATIONS.forEach((minutes) => chips.push(buildChip(minutes)));
    const html = chips.join('');

    [dom.manualDurationChips, dom.editDurationChips].forEach((container) => {
      if (container) container.innerHTML = html;
    });
    [dom.clearDurationsBtn, dom.clearDurationsEditBtn].forEach((button) => {
      if (button) button.hidden = frequent.length === 0;
    });
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

  function updateTimeClearButtons() {
    if (dom.startTimeClear) dom.startTimeClear.hidden = !dom.startTime.value.trim();
    if (dom.endTimeClear) dom.endTimeClear.hidden = !dom.endTime.value.trim();
  }

  function updateDaily() {
    const startText = dom.startTime.value.trim();
    const endText = dom.endTime.value.trim();
    updateTimeClearButtons();
    const start = parseClock(startText);
    const end = parseClock(endText);
    const startInvalid = startText !== '' && !start;
    const endInvalid = endText !== '' && !end;
    const hasBoth = Boolean(start && end);

    [
      [dom.startTime, startInvalid],
      [dom.endTime, endInvalid]
    ].forEach(([input, invalid]) => {
      input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
      const field = input.closest('.time-field');
      if (field) field.classList.toggle('is-invalid', invalid);
    });

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
      dom.statusChip.textContent = startInvalid || endInvalid ? 'Geçersiz saat' : hasBoth ? 'Süre yok' : 'Saat girin';
      dom.statusChip.dataset.state = 'empty';
      dom.resultNote.classList.remove('is-good');
      if (startInvalid || endInvalid) {
        dom.resultNote.querySelector('span').textContent = 'Saatleri 24 saat biçiminde girin: SS:DD (örn. 17:30).';
      } else {
        dom.resultNote.querySelector('span').textContent = hasBoth
          ? 'Giriş ve çıkış saatleri geçerli bir süre oluşturmuyor.'
          : 'Sonuç, giriş ve çıkış saatleri girildiğinde güncellenir.';
      }
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
    if (startInvalid || endInvalid) {
      note = 'Geçerli bir saat girin. 24 saat biçimi: SS:DD (örn. 17:30).';
      noteIsError = true;
    } else if (hasBoth && netMinutes <= 0) {
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
        const label = `${formatDateLong(day)}, ${hasHours ? `${formatDuration(hours)} kayıtlı` : 'kayıt yok'}. Süre gir veya düzenle.`;
        return `<button class="mini-day${hasHours ? ' has-hours' : ''}${isToday ? ' is-today' : ''}" type="button" data-week-date="${key}" aria-label="${label}">
          <span class="mini-day-name">${WEEKDAYS_SHORT[weekdayIndex(day)]}</span>
          <span class="mini-day-num">${day.getDate()}</span>
          <span class="mini-day-hours">${hasHours ? formatDuration(hours) : '—'}</span>
        </button>`;
      })
      .join('');
  }

  function rememberTimes() {
    const start = formatTimeOfDay(dom.startTime.value);
    const end = formatTimeOfDay(dom.endTime.value);
    if (start) writeStorage(STORAGE.lastStart, start);
    if (end) writeStorage(STORAGE.lastEnd, end);
  }

  function normalizeTimeInput(input) {
    if (!input.value.trim()) return;
    const formatted = formatTimeOfDay(input.value);
    if (formatted) input.value = formatted;
    updateDaily();
    rememberTimes();
  }

  function autoFormatTimeInput(event) {
    if (event.inputType && event.inputType.startsWith('delete')) return;

    const input = event.target;
    const raw = input.value;
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    const caret = input.selectionStart ?? raw.length;
    const digitsBeforeCaret = raw.slice(0, caret).replace(/\D/g, '').length;

    const validHourPrefix = Number(digits.slice(0, 2)) <= 23;
    let formatted;
    if (digits.length >= 3) {
      const shorthand = digits.length === 3 && !raw.includes(':') && !validHourPrefix;
      formatted = shorthand ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
    } else if (digits.length === 2) {
      formatted = validHourPrefix ? `${digits}:` : digits;
    } else {
      formatted = digits;
    }

    if (formatted === raw) return;
    input.value = formatted;

    if (digits.length === 2) {
      input.setSelectionRange(formatted.length, formatted.length);
      return;
    }

    const position = Math.min(digitsBeforeCaret <= 2 ? digitsBeforeCaret : digitsBeforeCaret + 1, formatted.length);
    input.setSelectionRange(position, position);
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
        const clearLabel = `${formatDateLong(day)} kaydını temizle`;
        const clearButton = hasHours
          ? `<button class="day-clear" type="button" data-clear-date="${key}" title="${clearLabel}" aria-label="${clearLabel}">
              <svg class="icon" aria-hidden="true"><use href="#icon-x"/></svg>
            </button>`
          : '';
        return `<div class="day-cell">
          <button class="day-tile${hasHours ? ' has-hours' : ''}${isToday ? ' is-today' : ''}" type="button" data-date="${key}" aria-label="${label}">
            <span class="day-name">${WEEKDAYS_SHORT[weekdayIndex(day)]}</span>
            <span class="day-num">${day.getDate()}</span>
            <span class="day-hours">${hasHours ? formatDuration(hours) : '—'}</span>
          </button>
          ${clearButton}
        </div>`;
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

    const weekLabel = formatWeekRange(segment.start, segment.end, false);
    return `<article class="week-card${isCurrent ? ' is-current' : ''}" id="week-${toDateKey(segment.start)}">
      <div class="week-card-head">
        <div class="week-card-title">
          <span class="week-range">${weekLabel}</span>
          ${isCurrent ? '<span class="week-badge">Bu hafta</span>' : ''}
        </div>
        <div class="week-card-actions">
          <div class="week-card-amount">
            <strong>${formatMinutes(totals.total)}</strong>
            <span>/ ${formatMinutes(totals.target)}</span>
          </div>
          <button class="entry-clear" type="button" data-clear-week="${toDateKey(segment.start)}_${toDateKey(segment.end)}" title="${weekLabel} kayıtlarını temizle" aria-label="${weekLabel} kayıtlarını temizle">
            <svg class="icon" aria-hidden="true"><use href="#icon-trash"/></svg>
          </button>
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

  function removeRecords(keys) {
    const removed = {};
    keys.forEach((key) => {
      if (state.workData[key] === undefined) return;
      removed[key] = state.workData[key];
      delete state.workData[key];
    });
    return removed;
  }

  function restoreRecords(removed) {
    let restored = false;
    Object.keys(removed).forEach((key) => {
      if (state.workData[key] !== undefined) return;
      state.workData[key] = removed[key];
      restored = true;
    });
    if (!restored) return false;
    if (!saveWorkData()) return false;
    renderAllDataDependent();
    return true;
  }

  function clearRecordsWithUndo(keys, message) {
    const removed = removeRecords(keys);
    if (!Object.keys(removed).length) return;
    if (!saveWorkData()) return;
    renderAllDataDependent();
    showToast(message, {
      type: 'success',
      duration: 6500,
      actionLabel: 'Geri al',
      action: () => {
        if (restoreRecords(removed)) {
          showToast('Kayıtlar geri getirildi.', { type: 'success' });
        }
      }
    });
  }

  function clearDayRecord(key) {
    const date = fromDateKey(key);
    if (!date || state.workData[key] === undefined) return;
    clearRecordsWithUndo([key], `${formatDateLong(date)} kaydı temizlendi.`);
  }

  async function clearWeekRecords(startKey, endKey) {
    const start = fromDateKey(startKey);
    const end = fromDateKey(endKey);
    if (!start || !end) return;
    const keys = Object.keys(state.workData).filter((key) => key >= startKey && key <= endKey);
    if (!keys.length) return;
    const range = formatWeekRange(start, end, false);
    const proceed = await confirmAction({
      title: 'Hafta temizlensin mi?',
      message: `${range} aralığındaki ${keys.length} günlük kayıt silinecek.`,
      confirmLabel: 'Haftayı temizle'
    });
    if (!proceed) return;
    clearRecordsWithUndo(keys, `${range} kayıtları temizlendi.`);
  }

  async function clearMonthRecords(month) {
    const keys = Object.keys(state.workData).filter((key) => key.startsWith(`${month}-`));
    if (!keys.length) return;
    const label = monthLabelFromKey(month);
    const proceed = await confirmAction({
      title: 'Ay temizlensin mi?',
      message: `${label} ayındaki ${keys.length} günlük kayıt silinecek.`,
      confirmLabel: 'Ayı temizle'
    });
    if (!proceed) return;
    clearRecordsWithUndo(keys, `${label} kayıtları temizlendi.`);
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
            <button class="entry-clear" type="button" data-clear-month="${group.key}" title="${monthLabelFromKey(group.key)} ayının kayıtlarını temizle" aria-label="${monthLabelFromKey(group.key)} ayının kayıtlarını temizle">
              <svg class="icon" aria-hidden="true"><use href="#icon-trash"/></svg>
            </button>
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
    updateReminderStatus();
  }

  function notificationSupport() {
    return 'Notification' in window;
  }

  function permissionState() {
    if (!notificationSupport()) return 'unsupported';
    if (!window.isSecureContext && Notification.permission !== 'granted') return 'insecure';
    return Notification.permission;
  }

  function updatePermissionUi() {
    if (!dom.permissionStatus) return;
    const permission = permissionState();
    const labels = {
      granted: 'Bildirim izni verildi.',
      default: 'Bildirim izni henüz verilmedi.',
      denied: 'Bildirim izni engellendi. Tarayıcı ayarlarından izin verebilirsiniz.',
      insecure: 'Bildirimler yalnızca HTTPS veya localhost üzerinde çalışır.',
      unsupported: 'Bu tarayıcı bildirimleri desteklemiyor.'
    };
    dom.permissionStatus.textContent = labels[permission];
    dom.permissionStatus.dataset.state = permission;
    dom.permissionBtn.hidden = permission !== 'default';
    dom.testNotificationBtn.disabled = false;
  }

  function updateReminderStatus() {
    if (!dom.reminderStatus) return;
    if (!state.reminders.enabled) {
      dom.reminderStatus.textContent = '';
      return;
    }

    const permission = permissionState();
    if (permission === 'insecure') {
      dom.reminderStatus.textContent =
        'Hatırlatıcı, sayfa açıkken uygulama içinde gösterilecek. Masaüstü bildirimi için uygulamayı HTTPS üzerinden veya localhost’ta açın.';
      return;
    }
    if (permission === 'denied') {
      dom.reminderStatus.textContent =
        'Hatırlatıcı, sayfa açıkken uygulama içinde gösterilecek. Masaüstü bildirimi için tarayıcı ayarlarından bildirim iznini açın.';
      return;
    }
    if (permission === 'unsupported') {
      dom.reminderStatus.textContent = 'Bu tarayıcı bildirimleri desteklemiyor. Hatırlatıcı sayfa içinde gösterilecek.';
      return;
    }

    const now = new Date();
    const weekday = now.getDay();
    const todayKey = toDateKey(now);
    const parts = state.reminders.time.split(':');
    const targetMinutes = Number(parts[0]) * 60 + Number(parts[1]);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    let message;
    if (weekday === 0 || weekday === 6) {
      message = 'Bugün hafta sonu. Hatırlatıcı hafta içi günlerde çalışır.';
    } else if (state.workData[todayKey]) {
      message = `Bugün için ${formatDuration(state.workData[todayKey])} kayıtlı. Hatırlatıcı gönderilmeyecek.`;
    } else if (nowMinutes < targetMinutes) {
      message = `Bugün saat ${state.reminders.time}’de hatırlatılacak.`;
    } else {
      message = `Hatırlatma saati (${state.reminders.time}) geçti. Sayfa açıkken kısa süre içinde hatırlatılacak.`;
    }

    if (permission === 'default') {
      message += ' Bildirim izni verilmediği için hatırlatıcı sayfa içinde gösterilir.';
    }
    dom.reminderStatus.textContent = message;
  }

  async function requestNotificationPermission() {
    if (!notificationSupport()) {
      showToast('Bu tarayıcı bildirimleri desteklemiyor. Hatırlatıcı sayfa içinde gösterilecek.', { type: 'info' });
      return 'unsupported';
    }
    if (!window.isSecureContext && Notification.permission !== 'granted') {
      updatePermissionUi();
      showToast('Bildirimler yalnızca HTTPS veya localhost üzerinde çalışır. Hatırlatıcı sayfa içinde gösterilecek.', {
        type: 'info',
        duration: 7000
      });
      return 'insecure';
    }
    try {
      const permission = await Notification.requestPermission();
      updatePermissionUi();
      updateReminderStatus();
      if (permission === 'granted') {
        showToast('Bildirim izni verildi.', { type: 'success' });
      } else if (permission === 'denied') {
        showToast('Bildirim izni verilmedi. Hatırlatıcılar sayfa açıkken uygulama içinde gösterilecek.', { type: 'info', duration: 6000 });
      }
      return permission;
    } catch (error) {
      updatePermissionUi();
      updateReminderStatus();
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
    recordPresetUsage(dom.startTime.value, dom.endTime.value);

    closeDialog(dom.addDialog);
    renderAllDataDependent();
    showToast(`${formatDateLong(date)} için ${formatMinutes(minutes)} takvime eklendi.`, {
      type: 'success',
      duration: 6000,
      actionLabel: 'Takvimi aç',
      action: () => setTab('calendar')
    });
  }

  /* ---------- Manual calendar entry ---------- */

  function manualWeekDays() {
    const monday = startOfWeek(todayDate());
    return Array.from({ length: 6 }, (_, index) => addDays(monday, index));
  }

  function renderManualWeekDays() {
    const days = manualWeekDays();
    dom.manualWeekRange.textContent = formatWeekRange(days[0], days[5], true);
    dom.manualWeekDays.innerHTML = days
      .map((day) => {
        const key = toDateKey(day);
        const minutes = Math.round((state.workData[key] || 0) * 60);
        const hasRecord = minutes > 0;
        const isToday = key === toDateKey(todayDate());
        const label = `${formatDateLong(day)}, ${hasRecord ? `${formatMinutes(minutes)} kayıtlı` : 'kayıt yok'}. Seç.`;
        return `<button class="chip week-day-chip${hasRecord ? ' has-record' : ''}${isToday ? ' is-today' : ''}" type="button" data-manual-date="${key}" aria-label="${label}">
          <span>${WEEKDAYS_SHORT[weekdayIndex(day)]}</span>
          <strong>${day.getDate()}</strong>
          ${hasRecord ? `<small>${formatMinutes(minutes)}</small>` : ''}
        </button>`;
      })
      .join('');
  }

  function setManualDate(date) {
    dom.manualDate.value = toDateKey(date);
    updateManualDateUi();
  }

  function updateManualDateUi() {
    const date = fromDateKey(dom.manualDate.value);
    const selectedKey = date ? toDateKey(date) : '';
    $$('#manualWeekDays [data-manual-date]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.manualDate === selectedKey);
    });

    if (!date) {
      dom.manualDateLabel.textContent = 'Geçerli bir gün seçin.';
      dom.manualError.textContent = '';
      dom.manualSubmit.disabled = true;
      dom.manualExisting.className = 'existing-note';
      dom.manualExisting.textContent = '';
      return;
    }

    const isSunday = date.getDay() === 0;
    dom.manualDateLabel.textContent = formatDateLong(date);
    dom.manualError.textContent = isSunday ? 'Pazar günleri takvime kayıt eklenemez.' : '';
    dom.manualSubmit.disabled = isSunday;

    const existingHours = state.workData[toDateKey(date)] || 0;
    if (existingHours > 0) {
      dom.manualExisting.className = 'existing-note is-warning';
      dom.manualExisting.textContent = `Bu günde ${formatDuration(existingHours)} kayıt var. Kaydedince üzerine yazılacak.`;
    } else {
      dom.manualExisting.className = 'existing-note';
      dom.manualExisting.textContent = '';
    }
  }

  function openManualDialog() {
    dom.manualForm.reset();
    dom.manualDuration.value = '';
    dom.manualError.textContent = '';
    renderManualWeekDays();
    setManualDate(defaultAddDate());
    openDialog(dom.manualDialog);

    window.setTimeout(() => {
      try {
        dom.manualDuration.focus({ preventScroll: true });
        dom.manualDuration.select();
      } catch (error) {
        dom.manualDuration.focus();
        dom.manualDuration.select();
      }
    }, 60);
  }

  function submitManualDialog(event) {
    event.preventDefault();
    const minutes = parseDuration(dom.manualDuration.value);
    if (minutes === null) {
      dom.manualError.textContent = 'Geçerli bir süre girin. 24 saat biçimi: SS:DD (örn. 08:30).';
      dom.manualDuration.focus();
      return;
    }
    if (minutes <= 0) {
      dom.manualError.textContent = 'Süre 00:00’dan büyük olmalı.';
      dom.manualDuration.focus();
      return;
    }

    const date = fromDateKey(dom.manualDate.value);
    if (!date) {
      dom.manualError.textContent = 'Lütfen geçerli bir gün seçin.';
      return;
    }
    if (date.getDay() === 0) {
      dom.manualError.textContent = 'Pazar günleri takvime kayıt eklenemez.';
      return;
    }

    const key = toDateKey(date);
    state.workData[key] = roundHours(minutes);
    if (!saveWorkData()) return;
    recordDurationUsage(minutes);

    if (state.calendarFilter !== 'all') state.calendarFilter = monthKey(date);
    closeDialog(dom.manualDialog);
    renderAllDataDependent();
    showToast(`${formatDateLong(date)} için ${formatMinutes(minutes)} takvime kaydedildi.`, {
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

    dom.editTitle.textContent = minutes > 0 ? 'Günü düzenle' : 'Güne süre ekle';
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
      dom.editError.textContent = 'Geçerli bir süre girin. 24 saat biçimi: SS:DD (örn. 08:30).';
      return;
    }
    if (minutes === 0) {
      delete state.workData[state.editingDate];
    } else {
      state.workData[state.editingDate] = roundHours(minutes);
    }
    if (!saveWorkData()) return;
    if (minutes > 0) recordDurationUsage(minutes);
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
    updateReminderStatus();
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

  /* ---------- Event wiring ---------- */

  function cacheDom() {
    dom.themeToggle = $('#themeToggle');
    dom.todayPillText = $('#todayPillText');
    dom.dailyForm = $('#dailyForm');
    dom.startTime = $('#startTime');
    dom.endTime = $('#endTime');
    dom.startTimeClear = $('#startTimeClear');
    dom.endTimeClear = $('#endTimeClear');
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
    dom.calendarManualBtn = $('#calendarManualBtn');
    dom.calendarEmptyManualBtn = $('#calendarEmptyManualBtn');
    dom.statDays = $('#statDays');
    dom.statTotal = $('#statTotal');
    dom.statWeek = $('#statWeek');
    dom.dataMeta = $('#dataMeta');
    dom.clearDataBtn = $('#clearDataBtn');
    dom.exportBtn = $('#exportBtn');
    dom.importBtn = $('#importBtn');
    dom.importFile = $('#importFile');
    dom.quickPresetChips = $('#quickPresetChips');
    dom.clearPresetsBtn = $('#clearPresetsBtn');
    dom.remindersToggle = $('#remindersToggle');
    dom.reminderOptions = $('#reminderOptions');
    dom.reminderTime = $('#reminderTime');
    dom.permissionStatus = $('#permissionStatus');
    dom.permissionBtn = $('#permissionBtn');
    dom.testNotificationBtn = $('#testNotificationBtn');
    dom.reminderStatus = $('#reminderStatus');
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
    dom.editDurationChips = $('#editDurationChips');
    dom.clearDurationsEditBtn = $('#clearDurationsEditBtn');
    dom.editError = $('#editError');
    dom.editDelete = $('#editDelete');
    dom.manualDialog = $('#manualDialog');
    dom.manualForm = $('#manualForm');
    dom.manualDuration = $('#manualDuration');
    dom.manualDurationChips = $('#manualDurationChips');
    dom.clearDurationsBtn = $('#clearDurationsBtn');
    dom.manualDate = $('#manualDate');
    dom.manualDateLabel = $('#manualDateLabel');
    dom.manualWeekRange = $('#manualWeekRange');
    dom.manualWeekDays = $('#manualWeekDays');
    dom.manualError = $('#manualError');
    dom.manualExisting = $('#manualExisting');
    dom.manualSubmit = $('#manualSubmit');
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

    [dom.startTime, dom.endTime].forEach((input) => {
      input.addEventListener('input', updateDaily);
      input.addEventListener('change', () => {
        updateDaily();
        rememberTimes();
      });
      input.addEventListener('blur', () => normalizeTimeInput(input));
    });
    [
      [dom.startTimeClear, dom.startTime],
      [dom.endTimeClear, dom.endTime]
    ].forEach(([button, input]) => {
      if (!button) return;
      button.addEventListener('click', () => {
        input.value = '';
        updateDaily();
        input.focus();
      });
    });
    [dom.startTime, dom.endTime, dom.reminderTime, dom.manualDuration, dom.editDuration]
      .filter(Boolean)
      .forEach((input) => input.addEventListener('input', autoFormatTimeInput));
    dom.dinnerToggle.addEventListener('change', updateDaily);

    dom.quickPresetChips.addEventListener('click', (event) => {
      const button = event.target.closest('[data-start][data-end]');
      if (!button) return;
      dom.startTime.value = button.dataset.start;
      dom.endTime.value = button.dataset.end;
      updateDaily();
      rememberTimes();
      dom.startTime.focus();
    });
    dom.clearPresetsBtn.addEventListener('click', clearFrequentPresets);
    [dom.clearDurationsBtn, dom.clearDurationsEditBtn].forEach((button) => {
      if (button) button.addEventListener('click', clearFrequentDurations);
    });

    dom.addForm.addEventListener('submit', submitAddDialog);
    dom.addDate.addEventListener('change', updateAddDateUi);
    $$('#addDateQuick [data-day-offset]').forEach((button) => {
      button.addEventListener('click', () => {
        setAddDate(addDays(todayDate(), Number(button.dataset.dayOffset)));
      });
    });

    dom.calendarManualBtn.addEventListener('click', openManualDialog);
    dom.calendarEmptyManualBtn.addEventListener('click', openManualDialog);
    dom.manualForm.addEventListener('submit', submitManualDialog);
    dom.manualDuration.addEventListener('input', () => {
      dom.manualError.textContent = '';
    });
    dom.manualDuration.addEventListener('blur', () => {
      const minutes = parseDuration(dom.manualDuration.value);
      if (minutes !== null) dom.manualDuration.value = formatMinutes(minutes);
    });
    dom.manualDurationChips.addEventListener('click', (event) => {
      const button = event.target.closest('[data-duration]');
      if (!button) return;
      dom.manualDuration.value = button.dataset.duration;
      dom.manualError.textContent = '';
      dom.manualDuration.focus();
    });
    dom.manualWeekDays.addEventListener('click', (event) => {
      const button = event.target.closest('[data-manual-date]');
      if (!button) return;
      const date = fromDateKey(button.dataset.manualDate);
      if (date) setManualDate(date);
    });
    dom.manualDate.addEventListener('change', updateManualDateUi);
    dom.manualDialog.addEventListener('close', () => {
      dom.manualError.textContent = '';
    });

    dom.editForm.addEventListener('submit', submitEditDialog);
    dom.editDuration.addEventListener('input', () => {
      dom.editError.textContent = '';
    });
    dom.editDuration.addEventListener('blur', () => {
      const minutes = parseDuration(dom.editDuration.value);
      if (minutes !== null) dom.editDuration.value = formatMinutes(minutes);
    });
    dom.editDurationChips.addEventListener('click', (event) => {
      const button = event.target.closest('[data-duration]');
      if (!button) return;
      dom.editDuration.value = button.dataset.duration;
      dom.editError.textContent = '';
      dom.editDuration.focus();
    });
    dom.editDelete.addEventListener('click', deleteEditingDay);

    dom.addDialog.addEventListener('close', () => {
      dom.addError.textContent = '';
    });
    dom.editDialog.addEventListener('close', () => {
      state.editingDate = null;
      dom.editError.textContent = '';
    });

    dom.weekMiniDays.addEventListener('click', (event) => {
      const day = event.target.closest('[data-week-date]');
      if (day) openEditDialog(day.dataset.weekDate);
    });
    dom.calendarContent.addEventListener('click', (event) => {
      const dayClear = event.target.closest('[data-clear-date]');
      if (dayClear) {
        clearDayRecord(dayClear.dataset.clearDate);
        return;
      }
      const weekClear = event.target.closest('[data-clear-week]');
      if (weekClear) {
        const [start, end] = weekClear.dataset.clearWeek.split('_');
        if (start && end) clearWeekRecords(start, end);
        return;
      }
      const monthClear = event.target.closest('[data-clear-month]');
      if (monthClear) {
        clearMonthRecords(monthClear.dataset.clearMonth);
        return;
      }
      const tile = event.target.closest('[data-date]');
      if (tile) openEditDialog(tile.dataset.date);
    });
    dom.calendarFilter.addEventListener('change', () => {
      state.calendarFilter = dom.calendarFilter.value;
      renderCalendar();
    });
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
      const normalized = formatTimeOfDay(dom.reminderTime.value);
      if (!normalized) {
        dom.reminderTime.value = state.reminders.time;
        showToast('Geçerli bir saat girin. 24 saat biçimi: SS:DD (örn. 18:00).', { type: 'error' });
        return;
      }
      dom.reminderTime.value = normalized;
      state.reminders.time = normalized;
      writeStorage(STORAGE.reminderTime, state.reminders.time);
      updateReminderStatus();
      showToast(`Hatırlatma saati ${state.reminders.time} olarak ayarlandı.`, { type: 'success' });
    });
    dom.reminderTime.addEventListener('blur', () => {
      const normalized = formatTimeOfDay(dom.reminderTime.value);
      if (normalized) dom.reminderTime.value = normalized;
    });

    dom.permissionBtn.addEventListener('click', requestNotificationPermission);
    dom.testNotificationBtn.addEventListener('click', testNotification);

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
      } else if (event.key === STORAGE.frequentPresets) {
        state.frequentPresets = loadFrequentPresets();
        renderQuickPresets();
      } else if (event.key === STORAGE.frequentDurations) {
        state.frequentDurations = loadFrequentDurations();
        renderDurationPresets();
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
    state.frequentPresets = loadFrequentPresets();
    state.frequentDurations = loadFrequentDurations();
    state.themeSetting = readStorage(STORAGE.theme) || 'system';
    state.reminders = loadReminderSettings();
    state.lastRenderDate = toDateKey(new Date());

    applyTheme(state.themeSetting, false);

    const lastStart = formatTimeOfDay(readStorage(STORAGE.lastStart) || '');
    const lastEnd = formatTimeOfDay(readStorage(STORAGE.lastEnd) || '');
    if (lastStart) dom.startTime.value = lastStart;
    if (lastEnd) dom.endTime.value = lastEnd;

    dom.addDate.min = '2020-01-01';
    dom.addDate.max = '2100-12-31';
    dom.manualDate.min = '2020-01-01';
    dom.manualDate.max = '2100-12-31';

    setupEvents();
    updateTodayUi();
    updateDaily();
    updateReminderUi();
    updatePermissionUi();
    renderQuickPresets();
    renderDurationPresets();
    renderAllDataDependent();
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
