const DATA_FILES = [
  'office_settings',
  'staff',
  'scenarios',
  'dictionaries',
  'documents',
  'rules',
  'banks',
  'client_messages',
  'local_borisoglebsk'
];

export async function loadData() {
  const data = {};
  for (const name of DATA_FILES) {
    const response = await fetch(`./data/${name}.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Не загрузился ${name}.json`);
    data[name] = await response.json();
  }
  return data;
}

export function makeLabels(data) {
  const labels = {};
  for (const group of ['basis', 'payments', 'settlements', 'certificates', 'flags']) {
    for (const row of data.dictionaries[group] || []) labels[row[0]] = row[1];
  }
  return labels;
}
