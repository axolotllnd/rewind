# Сторонние компоненты

Права на сторонние компоненты принадлежат их авторам. Автор REWIND не заявляет права на них. Их лицензии действуют независимо от лицензирования авторского кода REWIND.

| Компонент | Назначение | Лицензия / источник |
| --- | --- | --- |
| Electron / Chromium | Настольная оболочка и браузерные компоненты | MIT и лицензии компонентов Chromium; `LICENSE` и `LICENSES.chromium.html` рядом с приложением; [Electron](https://github.com/electron/electron) |
| React / React DOM | Интерфейс | MIT; [React](https://github.com/facebook/react) |
| Phosphor Icons | Иконки, включая знак перемотки | MIT; [Phosphor](https://github.com/phosphor-icons/react) |
| Manrope | Шрифт интерфейса | SIL Open Font License; [Manrope](https://github.com/sharanda/manrope) |
| IBM Plex Mono | Числовые данные | SIL Open Font License; [IBM Plex](https://github.com/IBM/plex) |
| FFmpeg 6.1.1 Gyan essentials x64 | Отдельный процесс захвата, обработки и сохранения медиа | GPLv3; [FFmpeg](https://ffmpeg.org), [сборки Gyan](https://www.gyan.dev/ffmpeg/builds/) |
| ffmpeg-static | Получение платформенной сборки FFmpeg при разработке | GPL-3.0-or-later; [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) |

Поставляемый FFmpeg — `6.1.1-essentials_build-www.gyan.dev`, полученный через `ffmpeg-static` (binary release `b6.1.1`). Начиная с REWIND 0.2.14 упаковщик меняет подсистему в PE-заголовке копии `ffmpeg.exe` для работы через каналы без консоли. Код и параметры компиляции FFmpeg сохраняются. Скрипт упаковки — [windows-executable.cjs](scripts/windows-executable.cjs). Версия и параметры сборки — [FFmpeg-BUILD.txt](third-party/FFmpeg-BUILD.txt). Текст GPLv3 — [FFmpeg-LICENSE.txt](third-party/FFmpeg-LICENSE.txt).

Соответствующий исходный код FFmpeg: [commit e38092ef93](https://github.com/FFmpeg/FFmpeg/commit/e38092ef93), [архив исходников](https://github.com/FFmpeg/FFmpeg/archive/e38092ef93.tar.gz). Копия этого архива приложена к релизу v0.2.7 как `FFmpeg-6.1.1-source.tar.gz`. Информация о версиях включённых библиотек находится в `FFmpeg-BUILD.txt`; эти библиотеки сохраняют собственные лицензии.

Установщик распространяет уведомления Electron/Chromium и каталог `THIRD-PARTY-NOTICES` с лицензиями FFmpeg, React, иконок и шрифтов. Исходники самого REWIND доступны в этом репозитории и через исходный архив релиза.

Звуковые сигналы REWIND генерируются собственным сценарием `scripts/build-sounds.cjs`. Оформление мастера установки создаёт `scripts/installer-art.ps1`.
