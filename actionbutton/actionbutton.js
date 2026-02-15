function ready(fn) {
  if (document.readyState !== 'loading'){
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

const column = 'ActionButton';
let app = undefined;
let data = {
  status: 'waiting',
  result: null,
  records: [],
  desc: null
}

function handleError(err) {
  console.error('ERROR', err);
  data.status = String(err).replace(/^Error: /, '');
}

async function applyActions(actions) {
  data.result = "Working...";
  try {
    await grist.docApi.applyUserActions(actions);
    data.result = 'Done';
  } catch (e) {
    data.result = `Please grant full access for writing. (${e})`;
  }
}

function parseButtons(row, mappings) {
  // If there is no mapping, test the original record.
  const mappedRow = grist.mapColumnNames(row) || row;
  if (!mappedRow.hasOwnProperty(column)) {
    return null;
  }
  let btns = mappedRow[column];
  // If only one action button is defined, put it within an Array
  if (!Array.isArray(btns)) {
    btns = [btns];
  }
  const keys = ['button', 'description', 'actions'];
  for (const btn of btns) {
    if (!btn || keys.some(k => !btn[k])) {
      return null;
    }
  }
  return btns;
}

function onRecords(rows, mappings) {
  try {
    data.status = '';
    data.result = null;
    const records = [];
    for (const row of rows) {
      const btns = parseButtons(row, mappings);
      if (btns) {
        records.push({
          id: row.id,
          buttons: btns
        });
      }
    }
    if (records.length === 0 && rows.length > 0) {
      data.status = `Need a visible column named "${column}". You can map a custom column in the Creator Panel.`;
    }
    data.records = records;
  } catch (err) {
    handleError(err);
  }
}

ready(function() {
  // Update the widget anytime the document data changes.
  grist.ready({columns: [{name: column, title: "Action"}]});
  grist.onRecords(onRecords);

  Vue.config.errorHandler = handleError;
  app = new Vue({
    el: '#app',
    data: data,
    methods: {applyActions}
  });
});
