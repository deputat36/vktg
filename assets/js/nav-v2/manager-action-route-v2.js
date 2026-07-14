function text(value) {
  return String(value ?? '').trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cardBase(item) {
  return text(item?.card_url) || `./deal-card-v2.html?id=${encodeURIComponent(item?.deal_id || '')}`;
}

function cardTab(item, tab) {
  return `${cardBase(item).split('#')[0]}#${tab}`;
}

export function managerItemNeedsDistribution(item) {
  return !item?.manager_id
    || item?.lawyer_assignment_state === 'waiting_assignment'
    || item?.broker_assignment_state === 'waiting_assignment';
}

export function buildManagerActionRoute(item) {
  const overdueTasks = number(item?.overdue_tasks_count);
  const blockingRisks = number(item?.blocking_risks_count);
  const overdueDocuments = number(item?.overdue_required_documents_count);
  const needsDistribution = managerItemNeedsDistribution(item);

  let primary = {
    kind: 'card',
    label: 'Открыть главное действие',
    href: cardBase(item)
  };

  if (overdueTasks > 0) {
    primary = {
      kind: 'tasks',
      label: `Разобрать просроченные задачи (${overdueTasks})`,
      href: cardTab(item, 'tasks')
    };
  } else if (blockingRisks > 0) {
    primary = {
      kind: 'risks',
      label: `Разобрать блокирующие риски (${blockingRisks})`,
      href: cardTab(item, 'risks')
    };
  } else if (overdueDocuments > 0) {
    primary = {
      kind: 'docs',
      label: `Разобрать просроченные документы (${overdueDocuments})`,
      href: cardTab(item, 'docs')
    };
  } else if (needsDistribution) {
    primary = {
      kind: 'responsibility',
      label: 'Уточнить ответственных',
      href: `./manager-source-remediation-v2.html?deal_id=${encodeURIComponent(item?.deal_id || '')}`
    };
  }

  const secondary = [];
  if (needsDistribution && primary.kind !== 'responsibility') {
    secondary.push({
      kind: 'responsibility',
      label: 'Ответственные',
      href: `./manager-source-remediation-v2.html?deal_id=${encodeURIComponent(item?.deal_id || '')}`
    });
  }
  if (blockingRisks > 0 && primary.kind !== 'risks') {
    secondary.push({ kind: 'risks', label: 'Риски', href: cardTab(item, 'risks') });
  }
  if (overdueDocuments > 0 && primary.kind !== 'docs') {
    secondary.push({ kind: 'docs', label: 'Документы', href: cardTab(item, 'docs') });
  }
  if (overdueTasks > 0 && primary.kind !== 'tasks') {
    secondary.push({ kind: 'tasks', label: 'Задачи', href: cardTab(item, 'tasks') });
  }

  return {
    primary,
    secondary: secondary.slice(0, 3),
    context: {
      overdueTasks,
      blockingRisks,
      overdueDocuments,
      needsDistribution
    }
  };
}
