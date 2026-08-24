/**
 * Graded communication ladder (FR4.8, BR-12). Pure decision function: given the
 * config rungs, the live state, and elapsed time, it returns the ONE thing to do
 * next. Never parallel — rungs fire strictly in order, one at a time (the next
 * rung is always `rungs[state.fired_rungs]`).
 *
 * Every value it reasons over comes from config/state; nothing is hard-coded.
 * Hard constraints enforced here (FR4.7):
 *   • engagement signal or opt-out cancels the whole ladder immediately;
 *   • a channel without consent is skipped (never sent), the ladder advances;
 *   • the voice rung honours a max-attempts cap and a minimum spacing;
 *   • quiet hours suppress rungs that opt into them (voice) — deferred, not sent.
 */
import type { Channel, ConsentFlags, LadderDecision, LadderDecisionInput, LadderRung } from './comms.types';

/** Minutes-from-dispatch at which a rung becomes eligible (config-driven). */
function rungDueMinutes(rung: LadderRung): number {
  return (rung.after_hours ?? 0) * 60 + (rung.after_minutes ?? 0);
}

function hasConsent(channel: Channel, consent: ConsentFlags): boolean {
  // in_app needs no explicit opt-in; every other channel is opt-in (BR-2).
  if (channel === 'in_app') return consent.in_app !== false;
  return consent[channel] === true;
}

/** True when `hour` falls inside the quiet window, which may wrap midnight. */
export function isWithinQuietHours(hour: number, start: number, end: number): boolean {
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function nextLadderStep(input: LadderDecisionInput): LadderDecision {
  const { rungs, state, elapsed_minutes, now } = input;

  if (state.opted_out) return { action: 'cancel', reason: 'recipient_opted_out' };
  if (state.engaged) return { action: 'cancel', reason: 'engagement_signal' };
  if (rungs.length === 0) return { action: 'done', reason: 'no_ladder_configured' };
  if (state.fired_rungs >= rungs.length) return { action: 'done', reason: 'ladder_exhausted' };

  const index = state.fired_rungs;
  const rung = rungs[index];

  // Not yet due → wait until it is.
  const due = rungDueMinutes(rung);
  if (elapsed_minutes < due) {
    return { action: 'wait', until_minutes: due, reason: `rung_${index}_not_due` };
  }

  // No consent for this channel → skip it (advance, don't send).
  if (!hasConsent(rung.channel, state.consent)) {
    return { action: 'skip', rung_index: index, reason: `no_consent_${rung.channel}` };
  }

  // Voice rung: cap attempts and enforce spacing (FR4.7).
  if (rung.channel === 'voice') {
    const cap = rung.max_attempts;
    if (cap !== undefined && state.voice_attempts >= cap) {
      return { action: 'done', reason: 'voice_attempts_exhausted' };
    }
    const spacing = rung.spacing_minutes;
    if (spacing !== undefined && input.minutes_since_last_voice !== undefined && input.minutes_since_last_voice < spacing) {
      return { action: 'wait', until_minutes: due + spacing, reason: 'voice_spacing' };
    }
  }

  // Quiet hours suppress opted-in rungs (voice) — defer, never send.
  if (rung.respect_quiet_hours && input.quiet_hours) {
    const { start_hour, end_hour } = input.quiet_hours;
    if (isWithinQuietHours(now.getHours(), start_hour, end_hour)) {
      return { action: 'wait', until_minutes: elapsed_minutes, reason: 'quiet_hours' };
    }
  }

  return { action: 'send', rung, rung_index: index, reason: `rung_${index}_due` };
}
