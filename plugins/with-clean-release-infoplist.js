const { withInfoPlist } = require('expo/config-plugins');

/**
 * Вычищает dev-ключи, которые expo-dev-client добавляет в Info.plist, чтобы они
 * НЕ уезжали в релизную сборку для App Store (Guideline 2.1 / privacy-полировка):
 *
 *  - NSLocalNetworkUsageDescription + NSBonjourServices (`_expo._tcp`) — нужны
 *    только дев-лаунчеру для поиска Metro по локальной сети. В релизе лаунчер не
 *    запускается, а строка с упоминанием «development servers» смущает и юзера,
 *    и ревьюера (лишний запрос доступа к локальной сети).
 *  - URL-схема `exp+catchword` — дип-линк дев-лаунчера. Основная схема
 *    `catchword://` (OAuth-редиректы) СОХРАНЯЕТСЯ.
 *
 * Плагин выполняется на каждом `expo prebuild`, поэтому правка переживает
 * регенерацию папки ios/ (которая в .gitignore).
 *
 * ВНИМАНИЕ: дев-разработка на СИМУЛЯТОРЕ не ломается (Metro по localhost).
 * Если понадобится дев-сборка на ФИЗИЧЕСКОМ устройстве по Wi-Fi — временно
 * убери этот плагин из app.json (устройству нужен доступ к локальной сети).
 */
module.exports = function withCleanReleaseInfoPlist(config) {
  return withInfoPlist(config, (config) => {
    const plist = config.modResults;

    delete plist.NSLocalNetworkUsageDescription;
    delete plist.NSBonjourServices;

    if (Array.isArray(plist.CFBundleURLTypes)) {
      for (const entry of plist.CFBundleURLTypes) {
        if (Array.isArray(entry.CFBundleURLSchemes)) {
          entry.CFBundleURLSchemes = entry.CFBundleURLSchemes.filter(
            (scheme) => scheme !== 'exp+catchword',
          );
        }
      }
      // Выбрасываем записи, оставшиеся без единой схемы.
      plist.CFBundleURLTypes = plist.CFBundleURLTypes.filter(
        (entry) =>
          !Array.isArray(entry.CFBundleURLSchemes) || entry.CFBundleURLSchemes.length > 0,
      );
    }

    return config;
  });
};
