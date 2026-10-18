import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Settings,
  Users,
} from '@/components/icons';
import { useEffect, useRef, useState, type Dispatch } from 'react';
import { arabic, clock, pagesCount } from '@/data/arabic';
import { PAGE_COUNT, surahOfPage } from '@/data/mushaf';
import { reciterById } from '@/data/reciters';
import { pagesDuration } from '@/data/timings';
import { pagesLabel } from '@/halaqa/labels';
import { endsRound, isBeforeStart, pagesOf, readerOf } from '@/halaqa/schedule';
import {
  currentPage,
  currentPages,
  isComplete,
  memberName,
  planOf,
  turnPhrase,
  type Action,
  type Prefs,
  type Session,
} from '@/halaqa/state';
import { chime } from '@/halaqa/chime';
import {
  useListen,
  useReciterTurn,
  useTimings,
  wakeSound,
} from '@/halaqa/useRecitation';
import { useTurnClock } from '@/halaqa/useTurnClock';
import { useWakeLock } from '@/hooks/useWakeLock';
import { MushafPage } from '@/mushaf/MushafPage';
import {
  ActionBar,
  BackButton,
  DoneButton,
  ListenButton,
  RecitationButton,
  SkipButton,
  TimerButton,
} from '@/components/ActionBar';
import { Brand } from '@/components/Logo';
import { HalaqaCircle } from '@/components/HalaqaCircle';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Sheet } from '@/components/Sheet';
import { StartPicker } from '@/components/StartPicker';

/**
 * The halaqa itself, the same on every screen: one thing at a time between
 * a line saying whose turn it is and a bar of buttons that pass it on.
 * That one thing is the Mushaf page, as large as the screen allows and
 * never scrolled, or the circle, which is also the reading order (every
 * seat says what it does next). A button in the top bar turns from one to
 * the other; the buttons below stay with both.
 *
 * On a reciter's turn his recitation plays, the page follows it, and the
 * turn passes on when it ends; the primary button pauses it instead.
 */
export function ReadingScreen({
  session,
  prefs,
  dispatch,
}: {
  session: Session;
  prefs: Prefs;
  dispatch: Dispatch<Action>;
}) {
  const { config, anchor, turn } = session;
  const plan = planOf(config);
  const pages = currentPages(session);
  const page = currentPage(session);
  const complete = isComplete(session);
  const member = config.members[readerOf(plan, turn)];
  const nextMember = config.members[readerOf(plan, turn + 1)];
  const nextPages = pagesOf(plan, anchor, turn + 1);
  const lastPageOfTurn = session.pageInTurn >= pages.length - 1;
  const reciting = !complete && member.kind === 'reciter';
  // A turn, and the pages it covers: a new key is a new turn to time or
  // to recite from its start.
  const turnKey = `${turn}:${anchor.turn}:${anchor.page}:${plan.mode}:${plan.pagesPerTurn}`;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [showing, setShowing] = useState<'mushaf' | 'circle'>('mushaf');
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  useWakeLock(!complete);

  const { timings, retry } = useTimings([
    config.reciter,
    ...config.members.flatMap((m) => (m.kind === 'reciter' ? [m.reciter] : [])),
  ]);

  const finishTurn = () => {
    if (complete) return;
    if (plan.mode === 'repeat' && endsRound(plan, turn) && plan.readers > 1)
      setToast((t) => ({
        id: (t?.id ?? 0) + 1,
        text: `اكتملت ${pagesLabel(pages)}`,
      }));
    dispatch({ type: 'finishTurn' });
  };

  // A turn that passes with nobody touching the screen says so, if the
  // reader keeps the tone on.
  const passOn = () => {
    if (prefs.cue === 'chime') chime();
    finishTurn();
  };

  // A reader's turn may be timed by the halaqa's reciter, with the
  // allowance the halaqa gives its readers; a reciter's turn is as long as
  // his recitation, and needs no clock.
  const timed = config.turnChange === 'reciter' && !complete && !reciting;
  const paceTimings = timings[config.reciter];
  const duration =
    timed && paceTimings
      ? pagesDuration(paceTimings, pages) * config.allowance
      : null;
  const clockState = useTurnClock({
    enabled: timed,
    duration,
    turnKey: `${turnKey}:${config.reciter}:${config.allowance}`,
    onExpire: passOn,
  });

  const recitation = useReciterTurn({
    reciter: member.kind === 'reciter' && !complete ? member.reciter : null,
    turnKey,
    pages,
    page,
    timings,
    rate: prefs.speed,
    onPage: (p) => dispatch({ type: 'goToPage', page: p }),
    onDone: passOn,
    onRetry: retry,
  });
  const listen = useListen({
    reciter: config.reciter,
    turnKey,
    page,
    timings,
    repeat: prefs.listenRepeat,
  });

  const left = reciting ? recitation.left : timed ? clockState.left : null;
  const total = reciting ? recitation.total : timed ? clockState.total : null;
  const progress = left !== null && total ? left / total : null;

  // Every press is a chance to unlock sound for a reciter whose turn comes
  // round later without one (see player.ts), and for the turn's tone.
  const press = (action: () => void) => () => {
    wakeSound();
    action();
  };
  const primary = press(() => {
    if (!lastPageOfTurn) dispatch({ type: 'nextPage' });
    else finishTurn();
  });
  const skip = press(finishTurn);
  const toggleRecitation = press(recitation.toggle);
  const toggleListen = press(listen.toggle);

  /* One pause for a reader's timed turn: the clock stops, and so does the
     reciter if «استمع» is playing, since a pause that leaves a voice
     reciting is not one. Resuming brings back what the pause stopped, and
     only that. */
  const listenHeld = useRef(false);
  const togglePause = () => {
    wakeSound();
    if (clockState.paused) {
      clockState.resume();
      if (listenHeld.current) listen.resume();
      listenHeld.current = false;
    } else {
      clockState.pause();
      listenHeld.current = listen.pause();
    }
  };
  const back = press(() => {
    if (session.pageInTurn > 0) dispatch({ type: 'previousPage' });
    else dispatch({ type: 'previousTurn' });
  });
  const canGoBack =
    session.pageInTurn > 0 ||
    (turn > 0 && !isBeforeStart(plan, anchor, turn - 1));

  /* A new page starts at its first line, on the rare screen too short to
     show it whole, where the reader finished at the foot of the last one. */
  useEffect(() => {
    document.querySelector('.mushaf-stage')?.scrollTo({ top: 0 });
  }, [page]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  /* The arrows turn the page the way a right-to-left book turns: left is
     forward. A focused button owns Space and Enter, and a field owns every
     key, so neither is taken from them; the arrows always work, since no
     control here claims them. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, select, textarea, [role="dialog"]')) return;
      if (settingsOpen || jumpOpen || complete) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (reciting) skip();
        else primary();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (canGoBack) back();
      } else if (e.key === ' ' && !t?.closest('button, a') && !scrolls(t)) {
        const listening = listen.status !== 'idle' && listen.status !== 'error';
        if (reciting) {
          e.preventDefault();
          toggleRecitation();
        } else if (timed) {
          e.preventDefault();
          togglePause();
        } else if (listening) {
          e.preventDefault();
          toggleListen();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const prefetch = [...nextPages, page + 1, page - 1].filter(
    (p) => p >= 1 && p <= PAGE_COUNT,
  );

  const reciter =
    member.kind === 'reciter' ? reciterById(member.reciter) : null;
  const nextName = memberName(nextMember);
  const announcement = complete
    ? 'خُتم المصحف. تقبّل الله منكم.'
    : `${turnPhrase(member)}، ${pagesLabel(pages)}${
        pages.length > 1 ? `، الآن الصفحة ${arabic(page)}` : ''
      }${
        reciter && recitation.status === 'blocked'
          ? `. اضغط «استمع إلى ${reciter.short}» لتبدأ تلاوته.`
          : ''
      }`;

  return (
    <div className="reading" data-showing={showing}>
      <a className="skip-link" href="#reading-main">
        {showing === 'mushaf' ? 'تخطَّ إلى الصفحة' : 'تخطَّ إلى الحلقة'}
      </a>
      <header className="topbar">
        <Brand compact />
        <button
          type="button"
          className="topbar-status"
          onClick={() => setJumpOpen(true)}
          aria-label={`الانتقال إلى صفحة. الآن: ${complete ? 'خُتم المصحف' : `${turnPhrase(member)}، الصفحة ${arabic(page)}`}`}
        >
          {complete ? (
            'خُتم المصحف'
          ) : (
            <>
              <strong>{turnPhrase(member)}</strong>
              {left === null ? (
                <span> · الصفحة {arabic(page)}</span>
              ) : (
                // With a clock beside it, a narrow phone has room only
                // for «ص ٢٤».
                <>
                  <span className="label-long"> · الصفحة {arabic(page)}</span>
                  <span className="label-short"> · ص {arabic(page)}</span>
                  <span className="topbar-clock"> · {clock(left)}</span>
                </>
              )}
            </>
          )}
        </button>
        <div className="topbar-actions">
          {complete ? null : (
            <button
              type="button"
              className="topbar-toggle"
              onClick={() =>
                setShowing((v) => (v === 'mushaf' ? 'circle' : 'mushaf'))
              }
              aria-label={showing === 'mushaf' ? 'اعرض الحلقة' : 'اعرض المصحف'}
            >
              {showing === 'mushaf' ? (
                <Users size={20} aria-hidden="true" />
              ) : (
                <BookOpen size={20} aria-hidden="true" />
              )}
              <span className="topbar-toggle-label" aria-hidden="true">
                {showing === 'mushaf' ? 'الحلقة' : 'المصحف'}
              </span>
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label="الإعدادات"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={20} aria-hidden="true" />
          </button>
        </div>
      </header>

      <output className="visually-hidden" aria-live="polite">
        {announcement}
      </output>

      <main className="reading-main" id="reading-main" tabIndex={-1}>
        {/* The brand in the bar says which app this is; the heading says
            where in it a screen reader has landed. */}
        <h1 className="visually-hidden">مجلس نور: الحلقة</h1>
        {complete ? (
          <Khatm
            onRestart={() => dispatch({ type: 'restartMushaf' })}
            onEnd={() => dispatch({ type: 'end' })}
            pagesRead={session.pagesRead}
          />
        ) : showing === 'circle' ? (
          <section className="circle-view" aria-label="الحلقة">
            <HalaqaCircle
              config={config}
              plan={plan}
              anchor={anchor}
              turn={turn}
              page={page}
              progress={progress}
              sounding={reciting && recitation.status === 'playing'}
            />
            <Sitting page={page} pagesRead={session.pagesRead} />
          </section>
        ) : (
          <section className="mushaf-view" aria-label="المصحف">
            {/* The stage is the room the page has. The page takes the most
                of it its shape allows, so it is never scrolled; only on a
                screen too short to read it whole (a phone on its side) is
                it kept at a readable size and scrolled, and then the stage
                is a tab stop, since text a keyboard cannot reach is text a
                keyboard cannot read. */}
            <section
              className="mushaf-stage"
              tabIndex={0}
              aria-label={`صفحة المصحف ${arabic(page)}`}
            >
              <MushafPage page={page} prefetch={prefetch} />
            </section>
            <nav className="page-nav" aria-label="تقليب الصفحات">
              <button
                type="button"
                className="quiet-button"
                onClick={press(() => dispatch({ type: 'previousPage' }))}
                aria-disabled={page <= 1}
                aria-label="الصفحة السابقة"
              >
                <ChevronRight size={20} aria-hidden="true" />
                <span aria-hidden="true">السابقة</span>
              </button>
              <button
                type="button"
                className="quiet-button page-nav-number"
                onClick={() => setJumpOpen(true)}
                aria-label={`الصفحة ${arabic(page)} من ${arabic(PAGE_COUNT)}، انتقل إلى صفحة`}
              >
                {arabic(page)} / {arabic(PAGE_COUNT)}
              </button>
              <button
                type="button"
                className="quiet-button"
                onClick={press(() => dispatch({ type: 'nextPage' }))}
                aria-disabled={page >= PAGE_COUNT}
                aria-label="الصفحة التالية"
              >
                <span aria-hidden="true">التالية</span>
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
            </nav>
          </section>
        )}
      </main>

      {complete ? null : (
        <ActionBar toast={toast} progress={progress}>
          <BackButton
            onClick={back}
            disabled={!canGoBack}
            label={session.pageInTurn > 0 ? 'الصفحة السابقة' : 'القارئ السابق'}
          />
          {reciter ? (
            <>
              <RecitationButton
                reciter={reciter}
                status={recitation.status}
                left={recitation.left}
                onClick={toggleRecitation}
              />
              <SkipButton
                onClick={skip}
                label={
                  nextPages.length
                    ? `تخطَّ إلى ${plan.readers > 1 ? `${nextName}، ` : ''}${pagesLabel(nextPages)}`
                    : 'تخطَّ، وبه يُختم المصحف'
                }
              />
            </>
          ) : (
            <>
              <DoneButton
                onClick={primary}
                alone={plan.readers === 1}
                step={
                  lastPageOfTurn
                    ? null
                    : `الصفحة التالية (${arabic(session.pageInTurn + 2)} من ${arabic(pages.length)})`
                }
                sub={
                  !lastPageOfTurn
                    ? null
                    : nextPages.length
                      ? `${plan.readers > 1 ? `${nextName} · ` : ''}${pagesLabel(nextPages)}`
                      : 'وبه يُختم المصحف'
                }
              />
              {timed ? (
                <TimerButton
                  paused={clockState.paused}
                  left={left}
                  onClick={togglePause}
                />
              ) : null}
              <ListenButton
                status={listen.status}
                page={pagesLabel([page])}
                onClick={toggleListen}
              />
            </>
          )}
        </ActionBar>
      )}

      <Sheet
        open={jumpOpen}
        onOpenChange={setJumpOpen}
        title="الانتقال إلى"
        description="اختر سورة أو جزءًا أو صفحة، ويُكمل صاحب الدور منها."
      >
        <StartPicker
          legend="الانتقال حسب"
          page={page}
          onChange={(p) => dispatch({ type: 'goToPage', page: p })}
        />
        <button
          type="button"
          className="button button-primary button-block"
          onClick={() => setJumpOpen(false)}
        >
          اقرأ من هنا
        </button>
      </Sheet>

      <SettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        session={session}
        prefs={prefs}
        dispatch={dispatch}
      />
    </div>
  );
}

/** Whether `el` is a region that scrolls, which Space belongs to. */
const scrolls = (el: Element | null) =>
  !!el && el.scrollHeight > el.clientHeight + 1;

/** Where the circle is in the Mushaf, and how far it has come today. */
function Sitting({ page, pagesRead }: { page: number; pagesRead: number }) {
  return (
    <div className="sitting">
      <p className="sitting-label">
        <span>سورة {surahOfPage(page).name}</span>
        <span>
          {arabic(page)} من {arabic(PAGE_COUNT)}
        </span>
      </p>
      <progress
        className="sitting-bar"
        aria-label="الموضع في المصحف"
        max={PAGE_COUNT}
        value={page}
      />
      <p className="sitting-note">
        {pagesRead
          ? `قرأتم ${pagesCount(pagesRead)} في هذا المجلس`
          : 'بداية المجلس'}
      </p>
    </div>
  );
}

function Khatm({
  onRestart,
  onEnd,
  pagesRead,
}: {
  onRestart: () => void;
  onEnd: () => void;
  pagesRead: number;
}) {
  return (
    <div className="khatm">
      <p className="khatm-ornament" aria-hidden="true">
        ۞
      </p>
      <h2 className="khatm-title">خُتم المصحف</h2>
      <p className="khatm-text">
        تقبّل الله منكم.
        {pagesRead ? ` قرأتم في هذا المجلس ${pagesCount(pagesRead)}.` : ''}
      </p>
      <div className="khatm-actions">
        <button
          type="button"
          className="button button-primary"
          onClick={onRestart}
        >
          ختمة جديدة من الفاتحة
        </button>
        <button type="button" className="button button-quiet" onClick={onEnd}>
          إنهاء الحلقة
        </button>
      </div>
    </div>
  );
}
