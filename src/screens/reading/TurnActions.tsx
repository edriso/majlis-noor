import { useLayoutEffect, useRef } from 'react';
import {
  ActionBar,
  BackButton,
  ListenButton,
  PrimaryButton,
  RetryButton,
  SkipButton,
  TimerButton,
  type PrimaryView,
} from '@/components/ActionBar';
import {
  backLabel,
  doneLabels,
  recitationLabels,
  sittingProgress,
  skipLabel,
} from '@/halaqa/labels';
import { placeOf } from '@/halaqa/state';
import type { Turn } from './useTurn';

/**
 * The buttons under the page and the circle: back, the one primary button,
 * and beside it what the turn offers: on a reader's turn the timer, if it
 * is timed, and «استمع»; on a reciter's, «تخطَّ», or trying again when his
 * recitation failed. The primary button stays in the same place in the
 * tree whatever the turn, so it stays the same element and keeps focus.
 *
 * Along the top runs the sitting's progress. A timed turn's clock is shown
 * once, on its pause button, and drains as a line along the main button.
 */
export function TurnActions({
  turn,
  onChooseListener,
}: {
  turn: Turn;
  /** Opens the list of sheikhs, when the one «استمع» uses cannot recite
      the page. */
  onChooseListener: () => void;
}) {
  const { session, reciter, recitation, next, nextEnd, actions } = turn;
  const back = useRef<HTMLButtonElement>(null);
  const primary = useRef<HTMLButtonElement>(null);

  /* Stepping back to the very first turn hides the button that was
     pressed; the focus goes on to the main button rather than out of the
     screen. Before paint, while the browser still has it on the button. */
  useLayoutEffect(() => {
    if (!turn.canGoBack && back.current === document.activeElement)
      primary.current?.focus();
  }, [turn.canGoBack]);

  const failed = !!reciter && recitation.failed;
  const view: PrimaryView = reciter
    ? {
        kind: 'recitation',
        reciter,
        status: recitation.status,
        skips: failed,
        labels: (left) =>
          recitationLabels({
            status: recitation.status,
            untimed: recitation.untimed,
            reciter: reciter.short,
            left,
            next,
            end: nextEnd,
            unit: turn.unit,
            range: turn.range,
          }),
      }
    : {
        kind: 'done',
        ...doneLabels({
          step: turn.lastPage
            ? null
            : { at: session.pageInTurn + 2, of: turn.pages.length },
          next,
          end: nextEnd,
        }),
      };

  const progress = sittingProgress({
    unit: turn.unit,
    page: turn.page,
    place: placeOf(session),
    from: session.from,
    until: session.until,
  });

  return (
    <ActionBar progress={progress}>
      <BackButton
        buttonRef={back}
        onClick={actions.back}
        hidden={!turn.canGoBack}
        label={backLabel({
          pageInTurn: session.pageInTurn,
          alone: turn.alone,
          unit: turn.unit,
        })}
      />
      <PrimaryButton
        buttonRef={primary}
        view={view}
        time={failed ? null : turn.time}
        onClick={
          !reciter
            ? actions.done
            : failed
              ? actions.skip
              : actions.toggleRecitation
        }
      />
      {reciter ? (
        failed ? (
          // His recording of the turn does not fit its timings: no try
          // will play it, so «تخطَّ», on the primary button, is all there is.
          recitation.untimed ? null : (
            <RetryButton
              onClick={actions.toggleRecitation}
              reciter={reciter.short}
            />
          )
        ) : (
          <SkipButton onClick={actions.skip} label={skipLabel(next, nextEnd)} />
        )
      ) : (
        <>
          {turn.timed ? (
            <TimerButton
              paused={turn.clock.paused}
              time={turn.time}
              onClick={actions.togglePause}
            />
          ) : null}
          <ListenButton
            status={turn.listen.status}
            what={turn.listen.what}
            untimed={turn.listen.untimedLabel}
            onClick={
              turn.listen.untimedLabel ? onChooseListener : actions.toggleListen
            }
          />
        </>
      )}
    </ActionBar>
  );
}
