const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Убирает entitlement `aps-environment`, который плагин expo-notifications
 * добавляет автоматически (он рассчитан на УДАЛЁННЫЕ пуши через APNs).
 *
 * Мы используем ТОЛЬКО ЛОКАЛЬНЫЕ уведомления (scheduleNotificationAsync,
 * DATE-триггеры) — им ни `aps-environment`, ни capability «Push Notifications»
 * на App ID не нужны. А с этим entitlement сборка падает: профиль подписи
 * не содержит Push Notifications, и Xcode ругается
 * «Provisioning Profile does not support the Push Notifications capability»
 * (сборка билда 12, 19.07.2026).
 *
 * Если когда-нибудь понадобятся СЕРВЕРНЫЕ пуши (Фаза 2) — убери этот плагин из
 * app.json, включи Push Notifications на App ID и перегенерируй профиль.
 *
 * Выполняется на каждом `expo prebuild` (папка ios/ в .gitignore).
 *
 * ВАЖНО про порядок: у mod'ов entitlements порядок применения ОБРАТНЫЙ порядку
 * в массиве plugins — последний плагин применяет свой mod ПЕРВЫМ. Чтобы вычистить
 * то, что добавит expo-notifications, этот плагин должен стоять ПЕРВЫМ в списке
 * (тогда он применится последним и увидит уже добавленный aps-environment).
 */
module.exports = function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
