import { Minus, Plus } from './icons';
import { useId, useState } from 'react';
import { arabic, digits } from '@/data/arabic';
import {
  clampPage,
  juzOfPage,
  juzStarts,
  PAGE_COUNT,
  surahOfPage,
  surahs,
} from '@/data/mushaf';
import { Choice } from './Choice';

type By = 'surah' | 'juz' | 'page';

/**
 * Where to read from, by surah, by juz or by page. Whichever way it is
 * chosen, the answer is a Mushaf page, and that page stays on screen under
 * the picker: the halaqa is counted in pages, so the page is what it starts
 * from.
 */
export function StartPicker({
  page,
  onChange,
  legend = 'من أين نبدأ؟',
}: {
  page: number;
  onChange: (page: number) => void;
  legend?: string;
}) {
  const [by, setBy] = useState<By>('surah');
  const id = useId();
  const current = surahOfPage(page);
  const juz = juzOfPage(page);

  return (
    <div className="start-picker">
      <Choice<By>
        legend={legend}
        value={by}
        onChange={setBy}
        options={[
          { value: 'surah', label: 'سورة' },
          { value: 'juz', label: 'جزء' },
          { value: 'page', label: 'صفحة' },
        ]}
      />

      {by === 'surah' && (
        <div className="field">
          <label className="visually-hidden" htmlFor={`${id}-surah`}>
            السورة
          </label>
          <select
            id={`${id}-surah`}
            className="select"
            value={current.n}
            onChange={(e) => onChange(surahs[Number(e.target.value) - 1].page)}
          >
            {surahs.map((s) => (
              <option key={s.n} value={s.n}>
                {arabic(s.n)}. {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {by === 'juz' && (
        <div className="field">
          <label className="visually-hidden" htmlFor={`${id}-juz`}>
            الجزء
          </label>
          <select
            id={`${id}-juz`}
            className="select"
            value={juz}
            onChange={(e) => onChange(juzStarts[Number(e.target.value) - 1])}
          >
            {juzStarts.map((_, i) => (
              <option key={i} value={i + 1}>
                الجزء {arabic(i + 1)}
              </option>
            ))}
          </select>
        </div>
      )}

      {by === 'page' && (
        <PageField id={`${id}-page`} page={page} onChange={onChange} />
      )}

      <p className="start-summary" aria-live="polite">
        <span className="start-summary-page">الصفحة {arabic(page)}</span>
        <span>
          سورة {current.name} · الجزء {arabic(juz)}
        </span>
      </p>
    </div>
  );
}

/**
 * A page number, typed or stepped. Not `type="number"`: that field throws
 * away ٢٤, which is what an Arabic keyboard types, and can only show Latin
 * digits. The draft is kept as typed and read back through `digits()`.
 */
function PageField({
  id,
  page,
  onChange,
}: {
  id: string;
  page: number;
  onChange: (page: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (value: string) => {
    const n = Number(digits(value));
    if (n) onChange(clampPage(n));
    setDraft(null);
  };
  return (
    <div className="field stepper">
      <button
        type="button"
        className="icon-button stepper-button"
        aria-label="الصفحة السابقة"
        aria-disabled={page <= 1}
        onClick={() => page > 1 && onChange(page - 1)}
      >
        <Minus size={18} aria-hidden="true" />
      </button>
      <label className="visually-hidden" htmlFor={id}>
        رقم الصفحة، من ١ إلى ٦٠٤
      </label>
      <input
        id={id}
        className="input stepper-input"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={draft ?? arabic(page)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(e.currentTarget.value);
          }
        }}
      />
      <span className="stepper-of" aria-hidden="true">
        من {arabic(PAGE_COUNT)}
      </span>
      <button
        type="button"
        className="icon-button stepper-button"
        aria-label="الصفحة التالية"
        aria-disabled={page >= PAGE_COUNT}
        onClick={() => page < PAGE_COUNT && onChange(page + 1)}
      >
        <Plus size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
