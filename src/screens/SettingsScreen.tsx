import { useCallback, useEffect, useState } from 'react';
import ScreenHeader from '../components/ScreenHeader';
import type { ListRow } from '../db/index';
import * as listsDb from '../db/lists';
import * as settingsDb from '../db/settings';
import type { SettingsMap } from '../db/settings';
import { useLongPress } from '../lib/useLongPress';
import './screens.css';

/**
 * Настройки — порт нативного src/screens/SettingsScreen.js:
 *  - Плеер: качество по умолчанию, автопереход серий, растяжение видео,
 *    тип перемотки (двойной тап = ±10 сек, без настройки секунд).
 *  - Списки: показ всех (включая скрытые), добавление, долгий тап →
 *    скрыть/удалить с правилами защиты; у «Просмотрено» — переключатель
 *    авто-переноса из Истории.
 */
export default function SettingsScreen() {
  const [settings, setSettings] = useState<SettingsMap | null>(null);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [menuList, setMenuList] = useState<ListRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ListRow | null>(null);
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState('');

  const reload = useCallback(() => {
    void (async () => {
      const [s, all, listCounts] = await Promise.all([
        settingsDb.getAllSettings(),
        listsDb.getLists({ includeHidden: true }),
        listsDb.getListItemCounts(),
      ]);
      const map: Record<number, number> = {};
      for (const row of listCounts) map[row.list_id] = row.count;
      setSettings(s);
      setLists(all);
      setCounts(map);
    })();
  }, []);

  useEffect(reload, [reload]);

  async function applySetting(key: keyof SettingsMap, value: string | boolean) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    await settingsDb.setSetting(key, value);
  }

  async function createList() {
    const name = newListName.trim();
    if (!name) return;
    await listsDb.createList(name);
    setNewListName('');
    setNewListOpen(false);
    reload();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await listsDb.deleteList(deleteTarget.id);
    } catch {
      // встроенные не удаляем — правила защиты (PLAN §5.5)
    }
    setDeleteTarget(null);
    setMenuList(null);
    reload();
  }

  if (!settings) {
    return (
      <div className="screen">
        <ScreenHeader title="Настройки" />
      </div>
    );
  }

  const watched = lists.find((l) => l.key === 'watched');

  return (
    <div className="screen">
      <ScreenHeader title="Настройки" />
      <div className="settingsContent">
        <div className="settingsSection">Плеер</div>
        <div className="settingsCard">
          <div className="settingsRow">
            <span className="settingsLabel">Качество по умолчанию</span>
            <div className="segmentWrap">
              <Segment
                label="720"
                active={settings.playerQuality === '720'}
                onPress={() => void applySetting('playerQuality', '720')}
              />
              <Segment
                label="480"
                active={settings.playerQuality === '480'}
                onPress={() => void applySetting('playerQuality', '480')}
              />
            </div>
          </div>
          <div className="settingsRow">
            <span className="settingsLabel">Автопереключение серий</span>
            <Toggle
              checked={Boolean(settings.playerAutoNext)}
              onChange={(v) => void applySetting('playerAutoNext', v)}
            />
          </div>
          <div className="settingsRow">
            <span className="settingsLabel">Растягивать видео по ширине</span>
            <Toggle
              checked={Boolean(settings.playerStretch)}
              onChange={(v) => void applySetting('playerStretch', v)}
            />
          </div>
          <div className="settingsRow settingsRowStack">
            <span className="settingsLabel">Кнопки плеера</span>
            <div className="segmentWrap">
              <Segment
                label="На видео"
                active={settings.playerControls === 'video'}
                onPress={() => void applySetting('playerControls', 'video')}
              />
              <Segment
                label="На панели"
                active={settings.playerControls === 'panel'}
                onPress={() => void applySetting('playerControls', 'panel')}
              />
              <Segment
                label="И там и там"
                active={settings.playerControls === 'both'}
                onPress={() => void applySetting('playerControls', 'both')}
              />
            </div>
          </div>
          <div className="settingsRow settingsRowLast">
            <span className="settingsLabel">Тип перемотки</span>
            <div className="segmentWrap">
              <Segment
                label="Свайп"
                active={settings.playerSeekMode === 'swipe'}
                onPress={() => void applySetting('playerSeekMode', 'swipe')}
              />
              <Segment
                label="Дабл-тап"
                active={settings.playerSeekMode === 'doubletap'}
                onPress={() => void applySetting('playerSeekMode', 'doubletap')}
              />
              <Segment
                label="Оба"
                active={settings.playerSeekMode === 'both'}
                onPress={() => void applySetting('playerSeekMode', 'both')}
              />
            </div>
          </div>
          <div className="settingsRow settingsRowLast">
            <span className="settingsLabel">Лента серий на панели</span>
            <Toggle
              checked={Boolean(settings.playerEpisodesStrip)}
              onChange={(v) => void applySetting('playerEpisodesStrip', v)}
            />
          </div>
        </div>
        <div className="settingsHint">Двойной тап перематывает на ±10 секунд</div>

        <div className="settingsSection">Списки</div>
        <div className="settingsCard">
          {lists.map((list, idx) => (
            <LongPressRow
              key={String(list.id)}
              isLast={idx === lists.length - 1}
              disabled={!list.hidable && !list.removable}
              onLongPress={() => setMenuList(list)}
            >
              <span className="settingsListName">
                <span className={`settingsLabel ${list.hidden ? 'hiddenList' : ''}`}>
                  {list.name}
                </span>
                {Boolean(list.hidden) && <span className="hiddenTag">скрыт</span>}
              </span>
              <span className="settingsCount">{counts[list.id] ?? 0}</span>
            </LongPressRow>
          ))}
        </div>

        {watched && (
          <div className="settingsCard">
            <div className="settingsRow settingsRowLast">
              <span className="settingsLabel">
                «{watched.name}»: авто-перенос из Истории
              </span>
              <Toggle
                checked={Boolean(watched.auto_from_history)}
                onChange={async (v) => {
                  await listsDb.setAutoFromHistory(watched.id, v);
                  reload();
                }}
              />
            </div>
          </div>
        )}

        <button
          type="button"
          className="addButton"
          onClick={() => setNewListOpen(true)}
        >
          + Добавить новый список
        </button>
      </div>

      {/* меню списка: долгий тап */}
      {menuList && (
        <ModalBackdrop onClose={() => setMenuList(null)}>
          <div className="modalTitle">{menuList.name}</div>
          {menuList.hidable && (
            <ModalAction
              label={menuList.hidden ? 'Показать' : 'Скрыть'}
              onPress={async () => {
                await listsDb.setHidden(menuList.id, !menuList.hidden);
                setMenuList(null);
                reload();
              }}
            />
          )}
          {menuList.removable && (
            <ModalAction
              label="Удалить"
              danger
              onPress={async () => {
                const n = counts[menuList.id] ?? 0;
                if (n > 0) {
                  // непустой пользовательский — с подтверждением (PLAN §5.5)
                  setDeleteTarget(menuList);
                } else {
                  await listsDb.deleteList(menuList.id);
                  setMenuList(null);
                  reload();
                }
              }}
            />
          )}
          {!menuList.hidable && !menuList.removable && (
            <div className="settingsHint">Этот список нельзя изменить</div>
          )}
        </ModalBackdrop>
      )}

      {/* подтверждение удаления непустого списка */}
      {deleteTarget && (
        <ModalBackdrop onClose={() => setDeleteTarget(null)}>
          <div className="modalTitle">
            В списке {counts[deleteTarget.id] ?? 0} аниме, точно удалить?
          </div>
          <div className="confirmRow">
            <button type="button" className="confirmBtn" onClick={() => void confirmDelete()}>
              <span className="confirmText danger">Да</span>
            </button>
            <button type="button" className="confirmBtn" onClick={() => setDeleteTarget(null)}>
              <span className="confirmText">Нет</span>
            </button>
          </div>
        </ModalBackdrop>
      )}

      {/* новый список */}
      {newListOpen && (
        <ModalBackdrop onClose={() => setNewListOpen(false)}>
          <div className="modalTitle">Новый список</div>
          <input
            className="settingsInput"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="Название"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createList();
            }}
          />
          <div className="confirmRow">
            <button type="button" className="confirmBtn" onClick={() => void createList()}>
              <span className="confirmText accent">Создать</span>
            </button>
            <button type="button" className="confirmBtn" onClick={() => setNewListOpen(false)}>
              <span className="confirmText">Отмена</span>
            </button>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}

/** Затемнение + карточка модалки (native Modal transparent). */
function ModalBackdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/**
 * Строка списка с долгим тапом (правый клик на ПК). disabled — у Истории
 * нет действий, меню не открываем (PLAN §5.5).
 */
function LongPressRow({
  children,
  isLast,
  disabled,
  onLongPress,
}: {
  children: React.ReactNode;
  isLast: boolean;
  disabled: boolean;
  onLongPress: () => void;
}) {
  const { handlers } = useLongPress(() => {
    if (!disabled) onLongPress();
  });
  return (
    <button
      type="button"
      className={`settingsRow ${isLast ? 'settingsRowLast' : ''}`}
      {...handlers}
    >
      {children}
    </button>
  );
}

function Segment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <button type="button" className={`segment ${active ? 'segmentActive' : ''}`} onClick={onPress}>
      {label}
    </button>
  );
}

/** Переключатель — DOM-замена RN Switch с теми же цветами. */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`toggle ${checked ? 'toggleOn' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggleThumb" />
    </button>
  );
}

function ModalAction({
  label,
  danger = false,
  onPress,
}: {
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <button type="button" className="modalAction" onClick={onPress}>
      <span className={`modalActionText ${danger ? 'danger' : ''}`}>{label}</span>
    </button>
  );
}
