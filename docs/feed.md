# Feed do RealMe

O feed é montado por uma Cloud Function HTTP (`feed`, em `functions/feed.js` + `functions/index.js`). Ele continua **cronológico**, com um ranking social leve e **determinístico**: dois refreshes seguidos com os mesmos dados devolvem a mesma ordem.

## Endpoint

```
GET https://us-central1-ifriendmatch.cloudfunctions.net/feed
Authorization: Bearer <Firebase ID token>
```

| Parâmetro   | Obrigatório | Descrição |
|-------------|-------------|-----------|
| `limit`     | não | Itens por página. Padrão `20`, máximo `40`. |
| `cursor`    | não | Valor de `nextCursor` da resposta anterior. Sem cursor = primeira página. |
| `user_id`   | não | Precisa ser igual ao uid do token (senão `403`). O uid sempre vem do token. |
| `since`     | não | Timestamp em ms do último item visto (`last_seen_timestamp` também é aceito). Só serve para calcular `newSinceCount`. |

### Resposta `200`

```json
{
  "items": [
    {
      "type": "post",
      "id": "abc123",
      "tier": "friend",
      "createdAt": 1792200000000,
      "creator": { "uid": "u1", "name": "Maria Souza", "username": "maria", "photo": "https://...", "verified": false },
      "engagement": { "likes": 4, "comments": 1 },
      "data": { "content": "...", "imgs": [], "music": "", "create": 1792200000000, "creatorid": "u1" }
    },
    {
      "type": "event",
      "id": "ev9",
      "tier": "friend",
      "createdAt": 1792100000000,
      "creator": { "uid": "u2", "name": "João", "username": "joao", "photo": null, "verified": false },
      "engagement": null,
      "data": { "eventTitle": "Festa", "eventDate": 1792900000000, "createAt": 1792100000000, "creatorId": "u2" }
    }
  ],
  "nextCursor": "eyJhc09mIjoxNzkyMjAwMDAwMDAwLCJvZmZzZXQiOjIwfQ",
  "hasMore": true,
  "asOf": 1792200000000,
  "total": 498,
  "newSinceCount": 3
}
```

- Timestamps do Firestore viram números (ms). O front converte de volta com `Timestamp.fromMillis`.
- `engagement` só vem preenchido para posts de desconhecidos (é o que o ranking precisa contar). Para os outros é `null`, e o card continua lendo curtidas e comentários em tempo real.
- `tier` ∈ `own | friend | fof | popular | other`.

### Erros

| Status | `error` |
|--------|---------|
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN` |
| 403 | `FORBIDDEN` (`user_id` diferente do token) |
| 405 | `METHOD_NOT_ALLOWED` |
| 500 | `INTERNAL_ERROR` |

## Paginação (cursor)

O cursor é `base64url({ asOf, offset })`.

- `asOf` é fixado na primeira página: posts criados depois dele **não entram** nas páginas seguintes, então a ordem não muda enquanto a pessoa rola.
- Posts novos aparecem no topo pelo listener em tempo real do front (`startLivePosts`), sem quebrar o scroll.
- Um refresh (pull-to-refresh ou recarregar a página) começa sem cursor, com um `asOf` novo.

## Algoritmo

1. **Pool de candidatos** (cache de 60s): os 1000 posts mais recentes e os 300 eventos mais recentes.
   - Ficam de fora posts com `visible: false` e posts antigos de mural (`wallTo` diferente do autor).
   - Posts de mural novos ficam só em `users/{dono}/wall` e nunca chegam ao pool.
2. **Grafo social** (cache de 5 min por usuário): amigos (`users/{uid}/friends`) e amigos de amigos (expande até 200 amigos).
3. **Classificação** de cada item:
   - `own`: autor é o próprio usuário.
   - `friend`: autor é amigo.
   - `fof`: amigo de amigo.
   - `popular`: desconhecido com `curtidas + 2 × comentários ≥ 3`.
   - `other`: desconhecido com pouco engajamento (só entra como fallback).
   - Eventos só aparecem se forem seus ou de amigos, o mesmo critério das regras de leitura.
4. **Montagem em lotes de 20**:
   - Janela de candidatos: os 40 itens conectados (`own`, `friend`, `fof`, `popular`) mais recentes que ainda não foram usados. Isso mantém a cronologia como sinal mais forte.
   - Cotas tiradas da janela, sempre do mais novo para o mais velho: **12** de `own+friend` (60%), **6** de `fof` (30%), **2** de `popular` (10%).
   - Se faltar item em alguma cota, completa com o que sobrou na janela, por prioridade de tier e depois por data.
   - Quando acabam os conectados, completa com o **fallback**: posts recentes populares de qualquer pessoa (por dia, depois engajamento, depois data).
5. **Ordem dentro do lote**: janela de 6 horas (mais nova primeiro) → tier (`own` → `friend` → `fof` → `popular` → `other`) → data → id.
   - Na mesma janela de 6h, seus posts vêm antes dos de amigos, que vêm antes dos de amigos de amigos.
   - Entre janelas diferentes, vale a data.

Não há aleatoriedade: a ordem depende só de timestamp, grafo e engajamento. Os caches deixam o engajamento estável por alguns minutos, então o feed não "pula" a cada refresh.

### Custo na escala atual (~512 posts)

- Por requisição: 1 leitura de amigos + até 200 leituras de amigos de amigos (com cache) + o pool (com cache).
- Contagens de engajamento só para posts de desconhecidos, com cache de 5 min.
- O ranking em si é em memória: O(n) por lote, desprezível para ~1300 itens.

## Front-end (`src/js/pages/feed/render/postsRender.js`)

- Ao entrar no feed (com o usuário autenticado), faz `GET /feed?limit=20&user_id=<uid>&since=<feedLastSeen>`.
- O scroll infinito chama de novo com `cursor=nextCursor` quando falta 30% para o fim, até `hasMore` ser `false`.
- O nome e a foto do autor vêm na resposta (`creator`), então não há leituras extras por card.
- `feedLastSeen` (localStorage) guarda o item mais novo já mostrado e é enviado como `since`.
- **Fallback**: se o endpoint não responder na primeira página (por exemplo, function não publicada), o feed volta para a consulta cronológica antiga direto no Firestore.

## Mural

- Escrever no mural de alguém cria **apenas** `users/{dono}/wall/{id}` com `{ authorId, content, imgs, createdAt }`. Nada é gravado em `posts`.
- As regras do Firestore impedem criar post global com `wallTo` de outra pessoa.
- Curtidas e comentários de posts de mural ficam em `users/{dono}/wall/{id}/likers` e `/coments`. O card identifica o post pelo caminho completo (`postSegments` em `postPath.js`).

## Notificações

| Gatilho | Function | Notificação in-app (`type`) | Push |
|---------|----------|-----------------------------|------|
| Alguém escreve no seu mural | `onWallPostCreated` (`users/{dono}/wall/{id}`) | `wall_post` | "escreveu no seu mural: …" → abre seu perfil |
| Alguém confirma presença no seu evento | `onEventGoingCreated` (`events/{id}/going/{uid}`) | `event_going` | "vai ao seu evento …" → abre o evento (`feed.html?event=<id>`) |

O push usa os tokens de todos os aparelhos do usuário (`users/{uid}/fcmTokens`) e mensagens só com `data`, exibidas pelo service worker.
