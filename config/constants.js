// Constantes da aplicação
export const CACHE_CONFIG = {
  POSTS_TTL: 5 * 60 * 1000,          // 5 minutos para posts
  BUBBLES_TTL: 3 * 60 * 1000,        // 3 minutos para bubbles (expiram em 24h)
  USERS_TTL: 10 * 60 * 1000,         // 10 minutos para dados de usuário
  CHECK_UPDATE_INTERVAL: 2 * 60 * 1000, // Verificar atualizações a cada 2 minutos
  MAX_CACHED_POSTS: 100,             // Máximo de posts em cache
  MAX_CACHED_BUBBLES: 50             // Máximo de bubbles em cache
};

export const COMENTARIOS_CACHE_TTL = 2 * 60 * 1000; // 2 minutos
export const COMENTARIOS_CACHE_PREFIX = 'coments_cache_';
export const COMENTARIOS_CACHE_MAX_POSTS = 30; // máximo de posts em cache

export const POSTS_LIMIT = 10;
