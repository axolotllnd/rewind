import ClipThumbnail from './ClipThumbnail';
import AppMaintenance from './AppMaintenance';
import React, { useState, useEffect } from 'react';
import { SpeakerHigh, Microphone, Plus, X, ArrowRight, Info, FolderOpen, Rewind, Sun, Moon, CheckCircle, Play, PencilSimple, Trash, Images, ArrowUpRight, ArrowCounterClockwise } from '@phosphor-icons/react';
import { IconButton, Toggle, Select, duration } from './ui';
import { t, f } from './i18n';
const api = window.rewind;
export function AudioPage({
  cfg,
  configure,
  locked,
  notice
}) {
  const [devices, setDevices] = useState([]),
    [loading, setLoading] = useState(false);
  async function load() {
    if (!api) return;
    setLoading(true);
    try {
      setDevices(await api.audioDevices());
    } catch (e) {
      notice(t('Не удалось получить устройства'), e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  const update = (id, patch) => configure({
    audio: cfg.audio.map(a => a.id === id ? {
      ...a,
      ...patch
    } : a)
  });
  return <div className="settings-content"><div className="wide-intro"><SpeakerHigh size={34} /><div><h2>{t('Игра, чат, микрофон. Отдельно.')}</h2><p>{t('Выбирай устройства Windows: наушники, колонки, микрофоны и виртуальные каналы.')}</p></div><button className="text-btn" onClick={load} disabled={loading}><ArrowCounterClockwise size={17} />{loading ? t('Загрузка…') : t('Обновить')}</button></div>{locked && <p className="info-note">{t('Останови захват, чтобы изменить звук.')}</p>}{cfg.audio.map(a => <section className="native-channel" key={a.id}><div className="channel-heading">{a.flow === 'output' || a.id === 'system' ? <SpeakerHigh size={23} /> : <Microphone size={23} />}<input aria-label={t('Название источника')} value={t(a.label)} disabled={locked} onChange={e => update(a.id, {
          label: e.target.value
        })} /><Toggle label={t('Записывать источник')} value={a.enabled} onChange={v => update(a.id, {
          enabled: v
        })} disabled={locked} /><IconButton label={t('Удалить источник')} disabled={locked} onClick={() => configure({
          audio: cfg.audio.filter(b => b.id !== a.id)
        })}><X size={17} /></IconButton></div><div className="native-channel-fields"><Select label={t('Источник Windows')} value={`${a.flow || (a.id === 'system' ? 'output' : 'input')}:${a.deviceId === 'system' ? 'default' : a.deviceId}`} onChange={v => {
          const split = v.indexOf(':'),
            flow = v.slice(0, split),
            id = v.slice(split + 1),
            d = devices.find(d => d.id === id);
          update(a.id, {
            flow,
            deviceId: id,
            ...(d ? {
              label: d.name
            } : {})
          });
        }} disabled={locked}><optgroup label={t('Устройства вывода')}><option value="output:default">{t('Вывод по умолчанию Windows')}</option>{devices.filter(d => d.flow === 'output').map(d => <option key={d.id} value={`output:${d.id}`}>{d.name}{d.isDefault ? ' ★' : ''}</option>)}</optgroup><optgroup label={t('Устройства ввода')}><option value="input:default">{t('Ввод по умолчанию Windows')}</option>{devices.filter(d => d.flow === 'input').map(d => <option key={d.id} value={`input:${d.id}`}>{d.name}{d.isDefault ? ' ★' : ''}</option>)}</optgroup></Select><Select label={t('Дорожка')} value={a.track} onChange={v => update(a.id, {
          track: +v
        })} disabled={locked}>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</Select><label className="field"><span>{t('Громкость')} · {a.gain}%</span><input type="range" min="0" max="200" value={a.gain} disabled={locked} onChange={e => update(a.id, {
            gain: +e.target.value
          })} /></label></div></section>)}<div className="audio-actions"><button className="secondary-btn" disabled={locked || cfg.audio.length >= 8} onClick={() => configure({
        audio: [...cfg.audio, {
          id: crypto.randomUUID(),
          label: t('Новый источник'),
          flow: 'output',
          deviceId: 'default',
          enabled: false,
          track: Math.min(6, cfg.audio.length + 1),
          gain: 100
        }]
      })}><Plus size={18} />{t('Добавить источник')}</button><button className="text-btn" disabled={locked} onClick={() => configure({
        audio: cfg.audio.map(a => ({
          ...a,
          track: 1
        }))
      })}>{t('Смешать всё в дорожку 1')}<ArrowRight size={16} /></button></div><div className="route-note"><h3><Info size={18} />{t('Как это работает')}</h3><p>{t('Выходные устройства записываются через WASAPI loopback: REWIND слышит именно выбранные наушники или колонки. Микрофоны записываются через устройства ввода. Настройки Windows не меняются.')}</p><p>{t('Источники с одинаковым номером дорожки смешиваются. Разные номера сохраняются отдельно. Для разделения игры и чата выбери соответствующие выходы Sonar; не дублируй их общим выходом.')}</p></div></div>;
}
export function SettingsPage({
  cfg,
  configure,
  notice
}) {
  async function folder() {
    if (!api) return notice(t('Доступно в приложении Windows'));
    try {
      const outputDir = await api.chooseFolder();
      configure({
        outputDir
      });
    } catch (e) {
      notice(t('Ошибка'), e.message);
    }
  }
  return <div className="settings-content"><section className="settings-section"><h2>{t('Язык приложения')}</h2><div className="setting-row"><div><h3>{t('Интерфейс и уведомления')}</h3><p>{t('Переключение применяется сразу.')}</p></div><select aria-label={t('Язык приложения')} value={cfg.language || 'ru'} onChange={e => configure({
          language: e.target.value
        })}><option value="ru">{t("Русский")}</option><option value="en">English</option></select></div></section><section className="settings-section"><h2>{t('Оформление')}</h2><div className="theme-options">{['dark', 'light'].map(theme => <button key={theme} className={`theme-card ${theme} ${cfg.theme === theme ? 'selected' : ''}`} onClick={() => configure({
          theme
        })}><div className="theme-card-swatch"><Rewind size={36} weight="fill" /><span>rewind.</span>{theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}</div><span>{theme === 'dark' ? t('Уголь и беж') : t('Свет и беж')}{cfg.theme === theme && <CheckCircle size={18} />}</span></button>)}</div></section><section className="settings-section"><h2>{t('Хранилище')}</h2><div className="setting-row"><div><h3>{t('Папка с клипами')}</h3><p className="folder-path">{cfg.outputDir || t('Выбрать папку')}</p></div><button className="secondary-btn" onClick={folder}><FolderOpen size={18} />{t('Изменить')}</button></div><div className="info-note"><Info size={18} /><span>{t('Новые записи и экспорты сохраняются в выбранную папку. Старые клипы остаются на своих местах и доступны в библиотеке.')}</span></div><div className="route-note"><h3>{t('Скользящий буфер')}</h3><p>{t('Хранятся только последние выбранные минуты. Устаревшие фрагменты удаляются каждую секунду. При обычной остановке несохранённый буфер очищается; файлы клипов появляются только после сохранения.')}</p><p>{t('Непрерывная запись сохраняет материал от начала до остановки. Границы повтора могут отличаться примерно на одну секунду из-за ключевых кадров.')}</p></div></section><section className="settings-section"><h2>{t('Звуки приложения')}</h2><div className="setting-row"><div><h3>{t('Мягкие звуковые сигналы')}</h3><p>{t('Тёплые короткие звуки отката, записи и действий приложения.')}</p></div><Toggle label={t('Звуки приложения')} value={cfg.soundEnabled!==false} onChange={soundEnabled=>configure({soundEnabled})}/></div><div className="setting-row"><div><h3>{t('Громкость сигналов')}</h3><p>{t('Негромко по умолчанию. Громкость игры не меняется.')}</p></div><label className="sound-volume"><input type="range" aria-label={t('Громкость сигналов')} min="0" max="100" value={cfg.soundVolume??35} onChange={e=>configure({soundVolume:+e.target.value})}/><span>{cfg.soundVolume??35}%</span></label></div><div className="sound-preview">{[['saving','Сохранение'],['saved','Повтор сохранён'],['start','Начало записи'],['stop','Конец записи'],['startup','Запуск приложения']].map(([id,label])=><button key={id} className="secondary-btn" onClick={()=>api?.sound?.(id,true)}><Play size={14}/>{t(label)}</button>)}</div></section><section className="settings-section"><h2>{t('Поведение приложения')}</h2>{[['launchAtLogin', t("Запускать вместе с Windows"), t("Старт в трее. Ранее включённый повтор восстановится, если включена настройка восстановления.")], ['minimizeToTray', t("Сворачивать в трей при закрытии"), t("Запись продолжится после закрытия окна.")], ['notifications', t("Уведомления поверх игры"), t("Плавный выезд и скрытие, цвета выбранной темы.")]].map(([key, label, detail]) => <div className="setting-row" key={key}><div><h3>{t(label)}</h3><p>{t(detail)}</p></div><Toggle label={t(label)} value={cfg[key]} onChange={v => configure({
          [key]: v
        })} /></div>)}<div className="setting-row notification-setting"><div><h3>{t('Положение уведомления')}</h3><p>{t('На экране, который ты записываешь.')}</p></div><div className="notification-positions" role="group" aria-label={t('Положение уведомления')}>{[['top-right','Справа вверху'],['bottom-right','Справа внизу']].map(([value,label])=><button key={value} className={cfg.notificationPosition===value?'selected':''} aria-pressed={cfg.notificationPosition===value} onClick={()=>configure({notificationPosition:value})}><span className={'position-mini '+value}><i/></span>{t(label)}</button>)}</div></div>{[['overlayGlow','Свечение уведомлений','Мягкое бежевое свечение вокруг плашки.'],['resumeReplay','Восстанавливать мгновенный повтор','Если повтор был включён, он запустится при следующем запуске REWIND.'],['revealAfterExport','Открывать папку после экспорта','Показывать готовый файл в Проводнике.']].map(([key,label,detail])=><div className="setting-row" key={key}><div><h3>{t(label)}</h3><p>{t(detail)}</p></div><Toggle label={t(label)} value={cfg[key]!==false} onChange={v=>configure({[key]:v})}/></div>)}<button className="text-btn" onClick={() => api?.notify({
        title: t('Мгновенный повтор включён'),
        detail: t('Так выглядит уведомление REWIND')
      })}><Play size={16} />{t('Проверить уведомление')}</button></section><AppMaintenance cfg={cfg} configure={configure}/><div className="about-row"><strong>REWIND 0.2.9</strong><span>{t('Локальная версия для Windows')}</span><button className="text-btn" onClick={() => api?.window('quit')}>{t('Полностью закрыть приложение')}</button></div></div>;
}
export function LibraryPage({
  library,
  setLibrary,
  notice,
  onStart,
  onEdit
}) {
  const [filter, setFilter] = useState('all'),
    [search, setSearch] = useState(''),
    [deleting, setDeleting] = useState(null);
  const items = library.filter(c => (filter === 'all' || c.kind === filter) && (c.title || c.name).toLowerCase().includes(search.toLowerCase()));
  async function importClips() {
    if (!api) return notice(t('Доступно в приложении Windows'));
    try {
      setLibrary(await api.importClips());
    } catch (e) {
      notice(t('Ошибка'), e.message);
    }
  }
  return <div className="library-page"><div className="library-toolbar"><div className="segments">{[['all', t("Все")], ['replay', t("Повторы")], ['record', t("Записи")], ['export', t("Экспорты")]].map(([id, label]) => <button key={id} className={filter === id ? 'selected' : ''} onClick={() => setFilter(id)}>{t(label)}</button>)}</div><input type="search" placeholder={t('Найти клип')} aria-label={t('Найти клип')} value={search} onChange={e => setSearch(e.target.value)} /><button className="secondary-btn" onClick={importClips}><Plus size={17} />{t('Импорт')}</button><IconButton label={t('Открыть папку')} onClick={() => api?.reveal()}><FolderOpen size={20} /></IconButton></div>{items.length ? items.map(c => <ClipRow key={c.id || c.path} clip={c} onEdit={() => onEdit(c)} onReveal={() => api?.reveal(c.id || c.name)} onDelete={() => setDeleting(c)} onRename={async title => {
      const result = await api.renameClip(c.id || c.name, title);
      setLibrary(l => l.map(x => x.id === c.id ? result : x));
    }} />) : <div className="empty-library"><Images size={64} weight="thin" /><h2>{t('Твои лучшие моменты — впереди.')}</h2><p>{t('Запиши первый клип или импортируй видео для монтажа.')}</p><button className="primary-btn" onClick={onStart}>{t('Перейти к записи')}<ArrowRight size={17} /></button></div>}{deleting && <div className="modal-backdrop"><section className="modal delete-modal" role="dialog" aria-modal="true"><h2>{t('Переместить клип в корзину?')}</h2><p>{deleting.title || deleting.name}</p><div className="modal-actions"><button className="secondary-btn" onClick={() => setDeleting(null)}>{t('Оставить')}</button><button className="primary-btn" onClick={async () => {
            try {
              setLibrary(await api.deleteClip(deleting.id || deleting.name));
              setDeleting(null);
            } catch (e) {
              notice(t('Ошибка'), e.message);
            }
          }}>{t('В корзину')}</button></div></section></div>}</div>;
}
export function ClipRow({
  clip: c,
  onEdit,
  onReveal,
  onDelete,
  onRename
}) {
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(c.title || c.name.replace(/\.[^.]+$/, '')),
    [error, setError] = useState('');
  async function save() {
    try {
      await onRename?.(name);
      setEditing(false);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }
  return <div className="clip-row"><button className="clip-play" onClick={onEdit} aria-label={t('Открыть редактор')}><ClipThumbnail clip={c}/></button><div className="clip-info">{editing ? <div className="rename-row"><input autoFocus value={name} maxLength={100} onChange={e => setName(e.target.value)} onKeyDown={e => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }} /><button className="text-btn" onClick={save}>{t('Сохранить')}</button><IconButton label={t('Отмена')} onClick={() => setEditing(false)}><X size={15} /></IconButton></div> : <button className="clip-title" onClick={onEdit}>{c.title || t(c.kind === 'record' ? t("Непрерывная запись") : c.kind === 'export' ? t("Экспорт") : t("Мгновенный повтор"))}</button>}<p>{new Date(c.createdAt).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'ru-RU', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        })} · {c.resolution}p · {c.fps} FPS · {c.tracks} {t('аудио')}</p>{error && <p className="inline-error">{error}</p>}</div><span className="clip-duration">{duration(c.duration)}</span><IconButton label={t('Переименовать')} onClick={() => setEditing(true)} disabled={!onRename}><PencilSimple size={18} /></IconButton><IconButton label={t('Открыть папку')} onClick={onReveal}><FolderOpen size={19} /></IconButton>{onDelete && <IconButton label={t('В корзину')} onClick={onDelete}><Trash size={18} /></IconButton>}</div>;
}
