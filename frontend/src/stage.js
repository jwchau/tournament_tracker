// Where a tournament is in its life: draft -> pool_play -> playoffs -> complete.
const STAGE_LABELS = {
  draft: 'Draft',
  pool_play: 'Pool play',
  playoffs: 'Playoffs',
  complete: 'Complete',
}

export function stageLabel(stage) {
  return STAGE_LABELS[stage] ?? stage
}
