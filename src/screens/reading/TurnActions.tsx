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
import { doneLabels, recitationLabels, skipLabel } from '@/halaqa/labels';
import type { Turn } from './useTurn';

/**
 * The buttons under the page and the circle: back, the one primary button,
 * and beside it what the turn offers: on a reader's turn the timer, if it
 * is timed, and «استمع»; on a reciter's, «تخطَّ», or trying again when his
 * recitation failed. The primary button stays in the same place in the
 * tree whatever the turn, so it stays the same element and keeps focus.
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
  const backLabel =
    session.pageInTurn > 0
      ? 'الصفحة السابقة'
      : !turn.alone
        ? 'القارئ السابق'
        : turn.unit === 'page'
          ? 'الصفحة السابقة'
          : 'الدور السابق';

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

  return (
    <ActionBar toast={turn.toast} time={turn.time}>
      <BackButton
        onClick={actions.back}
        disabled={!turn.canGoBack}
        label={backLabel}
      />
      <PrimaryButton
        view={view}
        time={turn.time}
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
