// to keep all calendar related logic;
let calendarHandler;

const CALENDAR_NAME = 'standardCalendar';

const t = i18next.t;

const urlParams = new URLSearchParams(window.location.search);
const isReadOnly = urlParams.get('readonly') === 'true' ||
  (urlParams.has('access') && urlParams.get('access') !== 'full');
const docTimeZone = urlParams.get('timeZone');
const colTypeParam = urlParams.get('colType');

// Most recent column mappings (widget name -> grist colId) and the calendar's
// own tableId. Used to write the extra event fields and to resolve the user
// reference options.
let latestMappings = null;
let latestTableId = null;

// Expose a few test variables on `window`.
window.gristCalendar = {
  calendarHandler,
  CALENDAR_NAME,
  dataVersion: Date.now(),
};

let TZDate = null;

function getLanguage() {
  if (this._lang) {
    return this._lang;
  } else {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    this._lang = urlParams.get('language') ?? 'en'
    return this._lang;
  }
}

//registering code to run when a document is ready
function ready(fn) {
  if (document.readyState !== 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

function isRecordValid(record) {
  const hasStartDate = record.startDate instanceof Date;
  const maybeHasEndDate = record.endDate === undefined ||
    record.endDate === null ||
    record.endDate instanceof Date ;
    const hasTitle = typeof record.title === 'string';
  const maybeHasIsAllDay = record.isAllDay === undefined || typeof record.isAllDay === 'boolean';
  return hasStartDate && maybeHasEndDate && hasTitle && maybeHasIsAllDay;
}

function getMonthName() {
  return calendarHandler.calendar.getDate().toDate().toLocaleString(getLanguage(), {month: 'long', year: 'numeric'})
}

function formatEventTitle(rawTitle) {
  const escaped = rawTitle
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/gs, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function plainTitle(rawTitle) {
  return rawTitle
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .trim();
}

class CalendarHandler {
  //TODO: switch to new variables once they are published.
  _mainColor =  'var(--grist-theme-input-readonly-border)';
    _calendarBackgroundColor =  'var(--grist-theme-page-panels-main-panel-bg)';
  _selectedColor = 'var(--grist-theme-top-bar-button-primary-fg)';
  _borderStyle =  '1px solid var(--grist-theme-table-body-border)';
  _accentColor =  'var(--grist-theme-accent-text)';
  _textColor =  'var(--grist-theme-text)';
  _selectionColor =  'var(--grist-theme-selection)';
  _calendarTheme = () => {return {
    common: {
      backgroundColor: this._calendarBackgroundColor,
      border: this._borderStyle,
      holiday: {color: this._textColor},
      gridSelection: {
        backgroundColor: this._selectionColor,
        border: `1px solid ${this._selectionColor}`
      },
      dayName: {
        color: this._textColor,
      },
      today: {
        color: this._textColor,
      },
      saturday:{
        color: this._textColor,
      }
    },
    week:{
      timeGrid:{
        borderRight: this._borderStyle,
      },
      timeGridLeft:{
        borderRight: this._borderStyle,
      },
      panelResizer:{
        border: this._borderStyle,
      },
      dayName:{
        borderBottom: this._borderStyle,
        borderTop: this._borderStyle,
      },
      dayGrid:{
        borderRight: this._borderStyle,
      },
      dayGridLeft:{
        borderRight: this._borderStyle,
      },
      timeGridHourLine:{
        borderBottom: this._borderStyle
      },
      gridSelection: this._accentColor,

      pastTime:{
        color: this._textColor,
      },
      futureTime:{
        color: this._textColor,
    },
      nowIndicatorLabel: {
        color: 'var(--grist-theme-accent-text)',
      },
      nowIndicatorPast: {
        border: '1px dashed var(--grist-theme-accent-border)',
      },
      nowIndicatorBullet: {
        backgroundColor: 'var(--grist-theme-accent-text)',
      },
      nowIndicatorToday: {
        border: '1px solid var(--grist-theme-accent-border)',
      },
      today: {
        color: this._textColor,
        backgroundColor: 'inherit',
      },
    },
    month: {
      dayName:{
        borderLeft: this._borderStyle,
        backgroundColor: 'inherit',
      },
      dayExceptThisMonth: {
        color: this._textColor,
      },
      holidayExceptThisMonth: {
        color: this._textColor,
      },
    }}
  }

  _getCalendarOptions() {
    return {
      week: {
        startDayOfWeek: 1,
        taskView: false,
        dayNames: [t('Sun'), t('Mon'), t('Tue'), t('Wed'), t('Thu'), t('Fri'), t('Sat')],
      },
      month: {
        startDayOfWeek: 1,
        dayNames: [t('Sun'), t('Mon'), t('Tue'), t('Wed'), t('Thu'), t('Fri'), t('Sat')],
      },
      usageStatistics: false,
      theme: this._calendarTheme(),
      defaultView: 'week',
      isReadOnly,
      template: {
        time(event) {
          const {title} = event;
          return `<span title="${plainTitle(title)}">${formatEventTitle(title)}</span>`;
        },
        allday(event) {
          const {title} = event;
          return `<span title="${plainTitle(title)}">${formatEventTitle(title)}</span>`;
        },
        popupDelete(){
          return t('Delete')
        },
        poupSave(){
          return t('Save')
        },
        popupEdit(){
          return t('Edit')
        },
        popupUpdate(){
          return t('Update')
        },
        allDayTitle() {
          return t('All Day')
        },
        popupIsAllday() {
          return t('All Day')
        }

      },
      calendars: [
        {
          id: CALENDAR_NAME,
          name: 'Personal',
          backgroundColor: this._mainColor,
          color: this._textColor,
          borderColor: this._mainColor,
        },
      ],
      useFormPopup: !isReadOnly,
      useDetailPopup: false, // We use our own logic to show this popup.
      gridSelection: {
        // Enable adding only via dbClick.
        enableDblClick: true,
        enableClick: false,
      },
    };
  }

  constructor() {
    const container = document.getElementById('calendar');
    if (isReadOnly) {
      container.classList.add('readonly')
    }
    const options = this._getCalendarOptions();
    this.calendar = new tui.Calendar(container, options);

    // Not sure how to get a reference to this constructor, so doing it in a roundabout way.
    TZDate = this.calendar.getDate().constructor;

    this.calendar.on('clickEvent', async (info) => {
      focusWidget();
      await grist.setCursorPos({rowId: info.event.id});
    });

    this.calendar.on('selectDateTime', async (info) => {
      this.calendar.clearGridSelections();

      // If this click results in the form popup, focus the title field in it.
      setTimeout(() => container.querySelector('input[name=title]')?.focus(), 0);
    });

    // Creation happens via the event-edit form. Snapshot the extra-field values
    // synchronously here, before the popup closes and clears them.
    this.calendar.on('beforeCreateEvent', (eventInfo) => upsertEvent(eventInfo, this._pendingExtra));

    // Updates happen via the form or when dragging the event or its end-time.
    this.calendar.on('beforeUpdateEvent', (update) => upsertEvent({id: update.event.id, ...update.changes}));

    // Deletion happens via the event-edit form.
    this.calendar.on('beforeDeleteEvent', (eventInfo) => deleteEvent(eventInfo));

    container.addEventListener('mousedown', () => {
      focusWidget();
      this._userInteracted = true;
      // Clear existing selection; this follows the suggested workaround in
      // https://github.com/nhn/tui.calendar/issues/1300#issuecomment-1273902472
      this.calendar.clearGridSelections();
    });

    container.addEventListener('mouseup', () => {
      // Fix dragging after a tap, when 'mouseup' follows the 'mousedown' so quickly that ToastUI
      // misses adding a handler, and doesn't stop the drag. If ToastUI handles it, it will stop
      // the drag or switch to a popup open. If on the next tick, the drag is still on, cancel it.
      setTimeout(() => {
        if (this.calendar.getStoreState('dnd').draggingState !== 0) {
          this.calendar.getStoreDispatchers('dnd').cancelDrag();
        }
      }, 0);
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        this.calendar.getStoreDispatchers('popup').hideFormPopup();
        this.calendar.getStoreDispatchers('popup').hideDetailPopup();
      } else if (ev.key === 'Enter') {
        // On a view popup, click "Edit"; on the edit popup, click "Save". Just try both to keep
        // it simple, since only one button will be present in practice.
        container.querySelector('button.toastui-calendar-edit-button')?.click();
        container.querySelector('button.toastui-calendar-popup-confirm')?.click();
      } else if (!isReadOnly && (ev.key === 'Delete' || ev.key === 'Backspace')) {
        // Delete the currently selected (highlighted) event. Undo is available via
        // Ctrl/Cmd+Z (enableKeyboardShortcuts).
        const target = ev.target;
        const isEditing = target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        );
        // Don't interfere with text editing or while a popup is open.
        if (isEditing || container.querySelector('.toastui-calendar-popup-container')) { return; }
        // Only delete an event that's actually shown (and highlighted) in the
        // current view, so a Delete press can't remove an off-screen record that
        // happens to be selected via linking.
        if (this._selectedRecordId && this._visibleEventIds.has(this._selectedRecordId)) {
          ev.preventDefault();
          const idToDelete = this._selectedRecordId;
          this._selectedRecordId = null;
          deleteEvent({id: idToDelete});
        }
      }
    });

    // All events, indexed by id.
    this._allEvents = new Map();

    // Ids of visible events that fall within the current date range. */
    this._visibleEventIds = new Set();

    // Whether the user has interacted with the calendar yet. Until they do, we
    // keep the calendar on the current week instead of jumping to the record
    // selected in a linked table when the widget first opens.
    this._userInteracted = false;

    // Values from the extra fields (users/activity) injected into the create
    // popup, captured while the popup is open and consumed on save.
    this._pendingExtra = null;

    // Inject the extra fields when the create popup opens, and clear the pending
    // values when it closes.
    this._popupObserver = new MutationObserver(() => {
      if (container.querySelector('.toastui-calendar-form-container')) {
        // The title field is hidden (see screen.css) but ToastUI marks it
        // `required`, which blocks form submission on a hidden control. Drop the
        // constraint so the popup can save with an empty (defaulted) title.
        const titleInput = container.querySelector('input[name="title"]');
        if (titleInput) { titleInput.required = false; }
        injectExtraFields(container);
      } else {
        this._pendingExtra = null;
      }
    });
    this._popupObserver.observe(container, {childList: true, subtree: true});
  }

  // Default user(s) for a new event: the row id(s) shared by every event
  // currently shown. When the calendar is linked/filtered on the users column,
  // this is the filtered user. Returns [] when there's no common user.
  getDefaultUsers() {
    const lists = [];
    for (const event of this._allEvents.values()) {
      if (event.users && event.users.length) { lists.push(event.users); }
    }
    if (!lists.length) { return []; }
    return lists.reduce((acc, list) => acc.filter(id => list.includes(id)));
  }

  _isMultidayInMonthViewEvent(rec)  {
    const startDate = rec.start.toDate();
    const endDate = rec.end.toDate();
    const isItMonthView = this.calendar.getViewName() === 'month';
    const isEventMultiDay = startDate.getDate() !== endDate.getDate() ||
      startDate.getMonth() !== endDate.getMonth() ||
      startDate.getFullYear() !== endDate.getFullYear();
    return isItMonthView &&  !isEventMultiDay
  }

  async selectRecord(record) {
    if (!isRecordValid(record) || this._selectedRecordId === record.id) {
      return;
    }

    if (this._selectedRecordId) {
      this._clearHighlightEvent(this._selectedRecordId);
    }
    const [startType] = await colTypesFetcher.getColTypes();
    const startDate = getAdjustedDate(record.startDate, startType);
    // Only navigate to the selected record once the user has interacted with
    // the calendar. This keeps the current week shown when the widget first
    // opens, instead of jumping to whatever record is selected in a linked
    // table. The record is still highlighted if it falls in the current view.
    if (this._userInteracted) {
      this.calendar.setDate(startDate);
    }
    this._selectedRecordId = record.id;
    updateUIAfterNavigation();

    // If the view has a vertical timeline, scroll to the start of the event.
    if (!record.isAllday && this.calendar.getViewName() !== 'month') {
      setTimeout(() => {
        const event = this.calendar.getElement(record.id, CALENDAR_NAME);
        if (!event) { return; }

        // Only scroll into view if the event is not fully on-screen.
        const container = event.closest('.toastui-calendar-time');
        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;
        const eventTop = event.offsetTop;
        const eventBottom = eventTop + event.clientHeight;
        const isOnscreen = eventTop >= containerTop && eventBottom <= containerBottom;
        if (!isOnscreen) {
          event.scrollIntoView({behavior: 'smooth'});
        }
      }, 0);
    }
  }

  _highlightEvent(eventId) {
    const event = this.calendar.getEvent(eventId, CALENDAR_NAME);
    if (!event) { return; }
    // If this event is shown on month view as a dot.
    const shouldPaintBackground = this._isMultidayInMonthViewEvent(event);
    // We will highlight it by changing the background color. Otherwise we will change the border color.
    const partToColor = shouldPaintBackground ? 'backgroundColor' : 'borderColor';
    this.calendar.updateEvent(eventId, CALENDAR_NAME, {
      ...{
        borderColor: event.raw?.['backgroundColor'] ?? this._mainColor,
        backgroundColor: event.raw?.['backgroundColor'] ?? this._mainColor,
      },
      [partToColor]: this._selectedColor
    });
  }

  _clearHighlightEvent(eventId) {
    const event = this.calendar.getEvent(eventId, CALENDAR_NAME);
    if (!event) { return; }
    // We will highlight it by changing the background color. Otherwise we will change the border color.
    this.calendar.updateEvent(eventId, CALENDAR_NAME, {
      borderColor: event.raw?.['backgroundColor'] ?? this._mainColor,
      backgroundColor: event.raw?.['backgroundColor'] ?? this._mainColor,
    });
  }

  // change calendar perspective between week, month and day.
  changeView(calendarViewPerspective) {
    this.calendar.changeView(calendarViewPerspective);
    updateUIAfterNavigation();
  }

  // navigate to the previous time period
  calendarPrevious() {
    this._userInteracted = true;
    this.calendar.prev();
    updateUIAfterNavigation();
  }

  // navigate to the next time period
  calendarNext() {
    this._userInteracted = true;
    this.calendar.next();
    updateUIAfterNavigation();
  }

  //navigate to today
  calendarToday() {
    this._userInteracted = true;
    this.calendar.today();
    updateUIAfterNavigation();
  }

  refreshSelectedRecord(){
    if (this._selectedRecordId) {
      this._highlightEvent(this._selectedRecordId);
    }
  }

  getEvents() {
    return this._allEvents;
  }

  setEvents(events) {
    this._allEvents = events;
  }

  /**
   * Adds/updates events that fall within the current date range, and removes
   * events that do not.
   */
  renderVisibleEvents() {
    const newVisibleEventIds = new Set();
    const dateRangeStart = this.calendar.getDateRangeStart();
    const dateRangeEnd = this.calendar.getDateRangeEnd().setHours(23, 99, 99, 999);

    // Add or update events that are now visible.
    for (const event of this._allEvents.values()) {
      const isEventInRange = (
        (event.start >= dateRangeStart && event.start <= dateRangeEnd) ||
        (event.end >= dateRangeStart && event.end <= dateRangeEnd) ||
        (event.start < dateRangeStart && event.end > dateRangeEnd)
      );
      if (!isEventInRange) { continue; }
  
      const calendarEvent = this.calendar.getEvent(event.id, CALENDAR_NAME);
      if (!calendarEvent) {
        this.calendar.createEvents([event]);
      } else {
        this.calendar.updateEvent(event.id, CALENDAR_NAME, event);
      }
      newVisibleEventIds.add(event.id);
    }

    // Remove events that are no longer visible.
    for (const eventId of this._visibleEventIds) {
      if (!newVisibleEventIds.has(eventId)) {
        this.calendar.deleteEvent(eventId, CALENDAR_NAME);
      }
    }

    this._visibleEventIds = newVisibleEventIds;
  }
}

// when a document is ready, register the calendar and subscribe to grist events
ready(async () => {
  await translatePage();
  calendarHandler = new CalendarHandler();
  window.gristCalendar.calendarHandler = calendarHandler;
  await configureGristSettings();

});

// Data for column mapping fields in Widget GUI
function getGristOptions() {
  return [
    {
      name: "startDate",
      title: t("Start Date"),
      optional: false,
      type: "Date,DateTime",
      description: t("starting point of event"),
      allowMultiple: false,
      strictType: true
    },
    {
      name: "endDate",
      title: t("End Date"),
      optional: true,
      type: "Date,DateTime",
      description: t("ending point of event"),
      allowMultiple: false,
      strictType: true
    },
    {
      name: "isAllDay",
      title: t("Is All Day"),
      optional: true,
      type: "Bool",
      description: t("is event all day long"),
      strictType: true
    },
    {
      name: "title",
      title: t("Title"),
      optional: false,
      type: "Text",
      description: t("title of event"),
      allowMultiple: false
    },
    {
      name: "type",
      title: t("Type"),
      optional: true,
      type: "Choice,ChoiceList",
      description: t("event category and style"),
      allowMultiple: false
    },
    {
      name: "highlight",
      title: t("Highlight"),
      optional: true,
      type: "Bool",
      description: t("highlight event with yellow background"),
      strictType: true
    },
    {
      name: "color",
      title: t("Color"),
      optional: true,
      type: "Text,Any",
      description: t("event background color"),
      allowMultiple: false
    },
    {
      name: "users",
      title: t("Users"),
      optional: true,
      type: "RefList",
      description: t("people linked to the event"),
      allowMultiple: false
    },
    {
      name: "activity",
      title: t("Activity"),
      optional: true,
      type: "Text",
      description: t("activity link"),
      allowMultiple: false
    }
  ];
}


function updateUIAfterNavigation() {
  calendarHandler.renderVisibleEvents();
  // update name of the month and year displayed on the top of the widget
  document.getElementById('calendar-title').innerText = getMonthName();
  // refresh colors of selected event (in month view it's different from in other views)
  calendarHandler.refreshSelectedRecord();
}

// let's subscribe to all the events that we need
async function configureGristSettings() {
  // CRUD operations on records in table
  grist.onRecords(updateCalendar);
  // When cursor (selected record) change in the table
  grist.onRecord(gristSelectedRecordChanged);
  // When options changed in the widget configuration (reaction to perspective change)
  grist.onOptions(onGristSettingsChanged);

  // To get types, we need to know the tableId. This is a way to get it.
  grist.on('message', (e) => {
    if (e.tableId) {
      latestTableId = e.tableId;
      usersResolver.update(latestTableId, latestMappings?.users);
    }
    if (e.tableId && e.mappingsChange) { colTypesFetcher.gotNewMappings(e.tableId); }
  });

  // TODO: remove optional chaining once grist-plugin-api.js includes this function.
  grist.enableKeyboardShortcuts?.();

  // bind columns mapping options to the GUI
  const columnsMappingOptions = getGristOptions();
  grist.ready({requiredAccess: isReadOnly ? 'read table' : 'full', columns: columnsMappingOptions, allowSelectBy: true});
}

async function translatePage() {

  const backendOptions = {

    loadPath: 'i18n/{{lng}}/{{ns}}.json',
    addPath: 'i18n/add/{{lng}}/{{ns}}',
    // don't allow cross domain requests
    crossDomain: false,
    // don't include credentials on cross domain requests
    withCredentials: false,
    // overrideMimeType sets request.overrideMimeType("application/json")
    overrideMimeType: false,
  }
  await i18next.use(i18nextHttpBackend).init({
    lng: getLanguage(),
    debug: false,
    saveMissing: true,
    returnNull: false,
    backend: backendOptions,
  }, function (err, t) {
    document.body.querySelectorAll('[data-i18n]').forEach(function (elem) {
      elem.textContent = t(elem.dataset.i18n);
    });
  });
}

// When a user selects a record in the table, we want to select it on the calendar.
function gristSelectedRecordChanged(record, mappings) {
  const mappedRecord = grist.mapColumnNames(record, mappings);
  if (mappedRecord && calendarHandler) {
    calendarHandler.selectRecord(mappedRecord);
  }
}

// when a user changes the perspective in the GUI, we want to save it as grist option
// - rest of logic is in reaction to the grist option changed
async function calendarViewChanges(radiobutton) {
  calendarHandler._userInteracted = true;
  changeCalendarView(radiobutton.value);
  if (!isReadOnly) {
    await grist.setOption('calendarViewPerspective', radiobutton.value);
  }
}

// When a user changes a perspective of calendar, we want this to be persisted in grist options between sessions.
// this is the place where we can react to this change and update calendar view, or when new session is started
// (so we are loading previous settings)
function onGristSettingsChanged(options, settings) {
  const view = options?.calendarViewPerspective ?? 'week';
  changeCalendarView(view);
  colTypesFetcher.setAccessLevel(settings.accessLevel);
};

function changeCalendarView(view) {
  selectRadioButton(view);
  calendarHandler.changeView(view);
}

// saving events to the table or updating existing one - basing on if ID is present or not in the send event
async function upsertGristRecord(gristEvent) {
  try {
    //to update the table, grist requires another format that it is returning by grist in onRecords event (it's flat is
    // onRecords event and nested ({id:..., fields:{}}) in grist table), so it needs to be converted
    const mappedRecord = grist.mapColumnNamesBack(gristEvent);if (!mappedRecord) { return; }
    // we cannot save record is some unexpected columns are defined in fields, so we need to remove them
    delete mappedRecord.id;
    // mapColumnNamesBack returns undefined for all absent fields, so we need to remove them as well
    // (we also use undefined for updates when a field hasn't changed).
    const filteredRecord = Object.fromEntries(Object.entries(mappedRecord)
                                 .filter(([key, value]) => value !== undefined));
    // Send nothing if there are no changes.
    if (Object.keys(filteredRecord).length === 0) { return; }
    const eventInValidFormat = {id: gristEvent.id, fields: filteredRecord};
    const table = await grist.getTable();
    if (gristEvent.id) {
      await table.update(eventInValidFormat);
    } else {
      const {id} =await table.create(eventInValidFormat);
      await grist.setCursorPos({rowId: id});
    }
  } catch (err) {
    // Nothing clever we can do here, just log the error.
    // Grist should actually show the error in the UI, but it doesn't.
    console.error(err);
  }
}

const secondsPerDay = 24 * 60 * 60;

function makeGristDateTime(tzDate, colType) {
  // tzDate is a date in local's (current browser's) timezone.
  // So if user is in UTC-5 and document is in UTC+2, we need to adjust the time by 7 hours (in minutes it's 420
  // and in seconds it's 25200). So basically reinterpret the time as UTC+2.

  // Here is the math. If we were to store the current time as it is, the document would see it as
  // 7 hours later. So we need to subtract 7 hours from the time that user picked.

  // For example: If user is in UTC-5 and document is in UTC+2, and user picked his current time 10:00, for a document
  // perspective it is 17:00 (as the current time for document is 7h ahead of user's time). So we need to subtract
  // 7 hours from 10:00 to get 3:00, which is 10:00 for document (in UTC+2) as it is 7 hours ahead.
  
  let unixTime = Math.floor(tzDate.valueOf() / 1000);

  // Get this date timezone (local one). NOTE: it has opposite sign to what will
  // be returned from a tzDate with a timezone marker
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset
  const localOffsetMin = -tzDate.getTimezoneOffset();

  // If we set timezone, it will have a correct sign.
  const docOffsetMin = !docTimeZone ? localOffsetMin : tzDate.tz(docTimeZone).getTimezoneOffset();

  if (colType === 'Date') {
    // Reinterpret the time as UTC. Note: timezone offset is in minutes.
    const secondsSinceEpoch = unixTime + localOffsetMin * 60;
    // Round down to UTC midnight.
    return Math.floor(secondsSinceEpoch / secondsPerDay) * secondsPerDay;
  } else {
    // So if user is in UTC-5 (local) and document is in UTC+2 (doc) the result is -7h = -5h - 2h
    const toShift = (localOffsetMin - docOffsetMin) * 60 /* offsets are in minutes */;
    unixTime += toShift;
    return unixTime;
  }
}

async function upsertEvent(tuiEvent, extra) {
  // conversion between calendar event object and grist flat format (so the one that is returned in onRecords event
  // and can be mapped by grist.mapColumnNamesBack)
  // tuiEvent can be partial: only the fields present will be updated in Grist.
  const [startType, endType] = await colTypesFetcher.getColTypes();
  const gristEvent = {
    id: tuiEvent.id,
    // undefined values will be removed from the fields sent to Grist.
    startDate: tuiEvent.start ? makeGristDateTime(tuiEvent.start, startType) : undefined,
    endDate: tuiEvent.end ? makeGristDateTime(tuiEvent.end, endType) : undefined,
    isAllDay: tuiEvent.isAllday !== undefined ? (tuiEvent.isAllday ? 1 : 0) : undefined,
    // The title column is read-only (it's a formula used only to render the event
    // label on the calendar), so it is never written back to Grist.
  }
  // Extra fields are only set when creating an event (no id) from the popup, and
  // only when they actually have a value — so we never write empty defaults to a
  // mapped column (which fails if it happens to be a formula column).
  if (!tuiEvent.id && extra) {
    if (latestMappings?.users && extra.users?.length) {
      gristEvent.users = ['L', ...extra.users];
    }
    if (latestMappings?.activity && extra.activity) {
      gristEvent.activity = extra.activity;
    }
  }
  upsertGristRecord(gristEvent);
}

async function deleteEvent(event) {
  try {
    const table = await grist.getTable();
    await table.destroy(event.id);
  } catch (e) {
    console.error(e);
  }
}

//helper function to select radio button in the GUI
function selectRadioButton(value) {
  for (const element of document.getElementsByName('calendar-options')) {
    if (element.value === value) {
      element.checked = true;
      element.parentElement.classList.add('active');
    }
    else{
      element.checked = false;
      element.parentElement.classList.remove('active');
    }
  }
}

/**
 * Returns a new date that's shifted towards UTC+0 if `colType` is `Date`.
 *
 * Returns `date` unchanged if `colType` is `DateTime`.
 */
function getAdjustedDate(date, colType) {
  // If we know the timezone, we need to adjust it so that it looks the same.
  // So by default we pretend that calendar renders document timezone.
  // But we avoid conversion if document and date timezones are the same 
  // (otherwise it sometimes gets messed up by SDT/DST conversion problems)
  if (docTimeZone && docTimeZone !== date.timezone && colType.startsWith('DateTime')) {
    return new TZDate(date).tz(docTimeZone);
  }
  if (colType !== 'Date') { return date; }

  // Like date.tz('UTC'), but accounts for DST differences.
  const ms = date.valueOf() + (date.getTimezoneOffset() * 60000);
  return new Date(ms);
}

// helper function to build a calendar event object from grist flat record
function buildCalendarEventObject(record, colTypes, colOptions) {
  let {startDate: start, endDate: end, isAllDay: isAllday} = record;
  let [startType, endType] = colTypes;
  let [,,type] = colOptions;
  endType = endType || startType;
  start = getAdjustedDate(start, startType);
  end = end ? getAdjustedDate(end, endType) : start;

  // Normalize records with invalid start/end times so that they're visible
  // in the calendar.
  if (end < start) { end = start; }

  if (startType === 'Date' && endType === 'Date') {
    isAllday = true;
  }
  // Workaround for midnight zero-length events not showing up.
  if (!isAllday && end.valueOf() === start.valueOf() && isZeroTime(end) && isZeroTime(start)) {
    end = new TZDate(end).addHours(1);
  }

  // Apply colors from the type column.
  const selected = (Array.isArray(record.type) ? record.type[0] : record.type) ?? '';
  const raw = clean({
    backgroundColor: type?.choiceOptions?.[selected]?.fillColor,
    color: type?.choiceOptions?.[selected]?.textColor,
  });
  const fontWeight = type?.choiceOptions?.[selected]?.fontBold ? '800' : 'normal';
  const fontStyle = type?.choiceOptions?.[selected]?.fontItalic ? 'italic' : 'normal';
  let textDecoration = type?.choiceOptions?.[selected]?.fontUnderline ? 'underline' : 'none';
  if (type?.choiceOptions?.[selected]?.fontStrikethrough) {
    textDecoration = textDecoration === 'underline' ? 'line-through underline' : 'line-through';
  }
  // Apply explicit color, overrides type colors.
  if (record.color && typeof record.color === 'string') {
    raw.backgroundColor = record.color;
    delete raw.color; // fall back to theme text color for legibility
  }
  // Apply yellow highlight if the highlight column is truthy — highest priority, overrides color.
  if (record.highlight) {
    raw.backgroundColor = '#fff9c4';
    raw.color = '#000000';
  }

  return {
    id: record.id,
    calendarId: CALENDAR_NAME,
    title: record.title,
    // Row ids of linked users, used to infer the default for new events.
    users: normalizeRefList(record.users),
    start,
    end,
    isAllday,
    category: 'time',
    state: 'Free',
    color: this._textColor,
    backgroundColor: this._mainColor,
    dragBackgroundColor: 'var(--grist-theme-hover)',
    raw, // Store it as an custom property. It will be used to revert any highlighting that might be done.
    ...raw, // And now paint the event with the color.
    borderColor: raw.backgroundColor, // We don't have a border color, so use the background color.
    customStyle: {
      fontStyle,
      fontWeight,
      textDecoration,
      textWrap : 'auto',
    }
  };
}

// when some CRUD operation is performed on the table, we want to update the calendar
async function updateCalendar(records, mappings) {
  if (mappings) {
    colTypesFetcher.gotMappings(mappings);
    latestMappings = mappings;
    usersResolver.update(latestTableId, mappings.users);
  }

  const mappedRecords = grist.mapColumnNames(records, mappings);
  // if any records were successfully mapped, create or update them in the calendar
  if (mappedRecords) {
    const colTypes = await colTypesFetcher.getColTypes();
    const colOptions = await colTypesFetcher.getColOptions();
    const events = mappedRecords
      .filter(isRecordValid)
      .map(r => buildCalendarEventObject(r, colTypes, colOptions));
    calendarHandler.setEvents(new Map(events.map(event => ([event.id, event]))));
    updateUIAfterNavigation();
  }
  window.gristCalendar.dataVersion = Date.now();
}

function focusWidget() {
  window.focus();
}

function isZeroTime(date) {
  return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
}

// We have no good way yet to get the type of a mapped column when multiple types are allowed. We
// get it via the metadata tables instead. There is no good way to know when a column's type is
// changed, so we skip that for now.
// TODO: Drop all this once the API can tell us column info.
class ColTypesFetcher {
  // Returns array of column records for the array of colIds.
  static async getTypes(tableId, colIds) {
    try {
      const tables = await grist.docApi.fetchTable('_grist_Tables');
      const columns = await grist.docApi.fetchTable('_grist_Tables_column');
      const fields = Object.keys(columns);
      const tableRef = tables.id[tables.tableId.indexOf(tableId)];
      return colIds.map(colId => {
        if (!colId) { return null; }
        const index = columns.id.findIndex((id, i) => (columns.parentId[i] === tableRef && columns.colId[i] === colId));
        if (index === -1) { return null; }
        return Object.fromEntries(fields.map(f => [f, columns[f][index]]));
      });
    } catch (err) {
      console.warn('Failed to fetch column metadata:', err);
      return colIds.map(() => null);
    }
  }

  constructor() {
    this._tableId = null;
    this._colIds = null;
    this._colTypesPromise = Promise.resolve([null, null, null]);
    this._accessLevel = 'full';
  }
  setAccessLevel(accessLevel) {
    this._accessLevel = accessLevel;
  }
  _shouldFetch() {
    if (this._accessLevel !== 'full') { return false; }
    if (colTypeParam && !this._colIds?.[2]) { return false; }
    return true;
  }
  _triggerFetch() {
    if (!this._shouldFetch() || !this._tableId || !this._colIds) { return; }
    this._colTypesPromise = ColTypesFetcher.getTypes(this._tableId, this._colIds);
  }
  gotMappings(mappings) {
    if (!this._colIds || !(
        mappings.startDate === this._colIds[0] &&
        mappings.endDate === this._colIds[1] &&
        mappings.type === this._colIds[2]
      )) {
      this._colIds = [mappings.startDate, mappings.endDate, mappings.type];
      this._triggerFetch();
    }
  }
  gotNewMappings(tableId) {
    this._tableId = tableId;
    this._triggerFetch();
  }

  async getColTypes() {
    if (colTypeParam) {
      const type = colTypeParam === 'date' ? 'Date' : 'DateTime';
      return [type, type];
    }
    return this._colTypesPromise.then(types => types.map(t => t?.type ?? 'DateTime'));
  }

  async getColOptions() {
    return this._colTypesPromise.then(types => types.map(t => safeParse(t?.widgetOptions)));
  }
}

const colTypesFetcher = new ColTypesFetcher();

// Normalize a Reference List cell value to a plain array of row ids. The plugin
// API decodes a RefList to `[id1, id2, ...]`, but we also tolerate the encoded
// `['L', id1, id2, ...]` form and a single Reference (`id` or `['R', ..., id]`).
function normalizeRefList(value) {
  if (Array.isArray(value)) {
    const arr = (value[0] === 'L' || value[0] === 'R' || value[0] === 'r')
      ? value.slice(value[0] === 'L' ? 1 : value.length - 1)
      : value;
    return arr.filter(v => typeof v === 'number');
  }
  if (typeof value === 'number') { return [value]; }
  return [];
}

// Resolves the selectable user options for the `users` RefList column: finds the
// referenced table and its display column, then fetches the labelled rows.
async function resolveUserOptions(tableId, usersColId) {
  if (!tableId || !usersColId) { return []; }
  try {
    const tables = await grist.docApi.fetchTable('_grist_Tables');
    const columns = await grist.docApi.fetchTable('_grist_Tables_column');
    const tableRef = tables.id[tables.tableId.indexOf(tableId)];
    const colIndex = columns.id.findIndex(
      (id, i) => columns.parentId[i] === tableRef && columns.colId[i] === usersColId);
    if (colIndex === -1) { return []; }

    // type is like "RefList:People" or "Ref:People".
    const targetTableId = String(columns.type[colIndex] || '').split(':')[1];
    if (!targetTableId) { return []; }

    // Resolve the display column's colId from visibleCol (a column row id).
    let displayColId = null;
    const visibleCol = columns.visibleCol[colIndex];
    if (visibleCol) {
      const vIndex = columns.id.indexOf(visibleCol);
      if (vIndex !== -1) { displayColId = columns.colId[vIndex]; }
    }

    const refData = await grist.docApi.fetchTable(targetTableId);
    const labels = displayColId && refData[displayColId] ? refData[displayColId] : refData.id;
    return refData.id.map((rowId, i) => ({rowId, label: String(labels[i] ?? rowId)}));
  } catch (err) {
    console.warn('Failed to resolve user options:', err);
    return [];
  }
}

// Caches the resolved user options and refreshes them when the table or the
// mapped `users` column changes.
const usersResolver = {
  _key: null,
  _options: [],
  async update(tableId, usersColId) {
    // The options are only needed for the create popup, which is hidden when
    // the widget is read-only.
    if (isReadOnly) { return; }
    const key = tableId && usersColId ? `${tableId}|${usersColId}` : null;
    if (key === this._key) { return; }
    this._key = key;
    if (!key) { this._options = []; return; }
    const options = await resolveUserOptions(tableId, usersColId);
    // Guard against a race with a newer update().
    if (this._key === key) { this._options = options; }
  },
  getOptions() { return this._options; },
};

// Injects the extra "Users" and "Activity" fields into the ToastUI event-creation
// form popup. Idempotent: only injects once per open popup, and only the fields
// whose columns are mapped.
function injectExtraFields(container) {
  const form = container.querySelector('.toastui-calendar-form-container');
  if (!form || form.querySelector('.grist-extra-fields')) { return; }

  const usersMapped = Boolean(latestMappings?.users);
  const activityMapped = Boolean(latestMappings?.activity);
  if (!usersMapped && !activityMapped) { return; }

  const pending = {
    users: usersMapped ? calendarHandler.getDefaultUsers() : [],
    activity: '',
  };
  calendarHandler._pendingExtra = pending;

  const section = document.createElement('div');
  section.className = 'grist-extra-fields';

  if (usersMapped) {
    const field = document.createElement('div');
    field.className = 'grist-extra-field';
    const label = document.createElement('label');
    label.textContent = t('Users');
    const select = document.createElement('select');
    select.className = 'grist-users-select';
    select.multiple = true;
    select.size = Math.min(Math.max(usersResolver.getOptions().length, 2), 5);
    for (const opt of usersResolver.getOptions()) {
      const option = document.createElement('option');
      option.value = String(opt.rowId);
      option.textContent = opt.label;
      if (pending.users.includes(opt.rowId)) { option.selected = true; }
      select.appendChild(option);
    }
    select.addEventListener('change', () => {
      pending.users = Array.from(select.selectedOptions).map(o => Number(o.value));
    });
    field.appendChild(label);
    field.appendChild(select);
    section.appendChild(field);
  }

  if (activityMapped) {
    const field = document.createElement('div');
    field.className = 'grist-extra-field';
    const label = document.createElement('label');
    label.textContent = t('Activity');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'grist-activity-input';
    input.addEventListener('input', () => { pending.activity = input.value; });
    field.appendChild(label);
    field.appendChild(input);
    section.appendChild(field);
  }

  // Insert right before the confirm-button section so it reads as the last
  // group of inputs in the form.
  const buttonSection = form.querySelector('.toastui-calendar-popup-button.toastui-calendar-popup-confirm')
    ?.closest('.toastui-calendar-popup-section');
  if (buttonSection && buttonSection.parentElement) {
    buttonSection.parentElement.insertBefore(section, buttonSection);
  } else {
    form.appendChild(section);
  }
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([k, v]) => v !== undefined));
}

// HACK: show Record Card popup on dblclick.
document.addEventListener('dblclick', async (ev) => {
  // tui calendar shows a popup on mouseup, and there is no way to customize it.
  // So we turn it off (by leaving useDetailPopup to false), and show the Record Card
  // popup ourselves.

  // Code that I read to make it happen:
  //
  // https://github.com/nhn/tui.calendar/blob/b53e765e8d896ab7c63d9b9b9515904119a72f46/apps/calendar/src/components/events/timeEvent.tsx#L233
  // if (isClick && useDetailPopup && eventContainerRef.current) {
  //   showDetailPopup(
  //     {
  //       event: uiModel.model,
  //       eventRect: eventContainerRef.current.getBoundingClientRect(),
  //     },
  //     false // this is flat parameter
  //   );
  // }

  // First some sanity checks.
  if (!ev.target || !calendarHandler.calendar) { return; }

  // Now find the uiModel.model parameter. This is typed as EventModel|null in the tui code.

  // First get the id of the event at hand.
  const eventDom = ev.target.closest("[data-event-id]");
  if (!eventDom) { return; }
  const eventId = Number(eventDom.dataset.eventId);
  if (!eventId || Number.isNaN(eventId)) { return; }

  // Now get the model from the calendar.
  const event = calendarHandler.calendar.getEventModel(eventId, CALENDAR_NAME);
  if (!event) { return; }

  // Now show the Record Card popup.
  await grist.setCursorPos({rowId: event.id});
  await grist.commandApi.run('viewAsCard');
});
