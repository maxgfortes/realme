# Sistema de Notificações em Tempo Real - RealMe

## 📋 Visão Geral

Este sistema permite que administradores do RealMe recebam notificações em tempo real quando:
- 👤 Um novo usuário é adicionado à coleção `users`
- 📝 Um novo post é adicionado à coleção `posts`

## 🏗️ Estrutura do Código

O sistema está organizado nos seguintes arquivos:

### 1. `admin-notifications.html`
**Localização:** `/admin-notifications.html`

Interface web para administradores com:
- Botão para solicitar permissão de notificações do navegador
- Painel de logs em tempo real
- Indicadores de status (permissão, admin, listeners)
- Design responsivo e moderno

### 2. `src/js/app.js`
**Localização:** `/src/js/app.js`

Lógica principal do WebApp que inclui:
- Verificação de permissões de administrador
- Integração com Firebase Cloud Messaging (FCM)
- Listeners em tempo real para as coleções `users` e `posts`
- Sistema de logs na interface
- Gerenciamento de notificações push

### 3. `src/js/firebase-config.js`
**Localização:** `/src/js/firebase-config.js`

Configuração centralizada do Firebase:
- Inicialização do Firebase App
- Exportação de serviços (Firestore, Realtime Database, Messaging)
- Configuração do Firebase Cloud Messaging

### 4. `service-worker.js`
**Localização:** `/service-worker.js`

Service Worker para gerenciar notificações push:
- Recebe notificações push do Firebase
- Exibe notificações mesmo quando a página não está aberta
- Cache de recursos estáticos
- Gerenciamento de cliques em notificações

## 🚀 Como Usar

### Para Administradores

1. **Acesse o painel de notificações:**
   ```
   https://maxgfortes.github.io/realme/admin-notifications.html
   ```

2. **Faça login com uma conta de administrador**
   - O sistema verifica automaticamente se o usuário tem permissões de admin

3. **Solicite permissão para notificações:**
   - Clique no botão "Solicitar Permissão para Notificações"
   - Autorize as notificações no navegador

4. **Monitore eventos em tempo real:**
   - Os logs mostrarão quando novos usuários se registram
   - Os logs mostrarão quando novos posts são criados
   - Você receberá notificações push do navegador para cada evento

### Requisitos

- ✅ Navegador moderno com suporte a:
  - Service Workers
  - Notificações Web API
  - Firebase SDK 10.12.0+
- ✅ Conexão com internet
- ✅ Conta de administrador no RealMe

## 🔐 Segurança

### Verificação de Administrador

O sistema implementa verificação de segurança em múltiplas camadas:

1. **Verificação no frontend** (`app.js`):
   ```javascript
   // Verifica se o usuário tem o campo isAdmin = true no Firestore
   const userDoc = await getDoc(doc(db, 'users', userData.uid));
   isAdmin = data.isAdmin === true;
   ```

2. **Lista de UIDs permitidos**:
   ```javascript
   const ADMIN_UIDS = ['admin_uid_placeholder'];
   ```

3. **Listeners só são ativados para admins**:
   - Os listeners do Firebase só começam a monitorar após confirmação de admin

### Como Adicionar Administradores

Para tornar um usuário administrador:

1. Acesse o Firebase Console
2. Vá para Firestore Database
3. Localize o documento do usuário em `users/{userId}`
4. Adicione o campo: `isAdmin: true`

Ou adicione o UID do usuário à lista `ADMIN_UIDS` em `src/js/app.js`:
```javascript
const ADMIN_UIDS = ['uid_do_admin_1', 'uid_do_admin_2'];
```

## 📱 Funcionalidades

### Notificações em Tempo Real

- **Novos Usuários:**
  - Título: "Novo Usuário no RealMe! 🎉"
  - Corpo: Nome do usuário que se registrou
  - Ícone: Foto de perfil do usuário

- **Novos Posts:**
  - Título: "Novo Post no RealMe! 📝"
  - Corpo: Prévia do conteúdo do post
  - Ícone: Logo do RealMe

### Sistema de Logs

Os logs são exibidos em tempo real na interface com:
- ⏰ Timestamp de cada evento
- 🎨 Cores diferentes por tipo (info, success, warning, error)
- 📊 Histórico de até 100 eventos
- 🗑️ Botão para limpar logs

### Service Worker

O Service Worker fornece:
- 📴 Notificações mesmo offline
- 💾 Cache de recursos estáticos
- 🔄 Atualização automática
- 👆 Ações interativas nas notificações (Abrir/Fechar)

## 🛠️ Configuração do Firebase Cloud Messaging

### Passo 1: Obter VAPID Key

1. Acesse o [Firebase Console](https://console.firebase.google.com/)
2. Selecione seu projeto (ifriendmatch)
3. Vá para **Project Settings** > **Cloud Messaging**
4. Na seção **Web configuration**, clique em **Generate key pair**
5. Copie a **VAPID key** gerada

### Passo 2: Atualizar o Código

Em `src/js/app.js`, localize e atualize:
```javascript
const token = await getToken(messaging, {
  vapidKey: 'SUA_VAPID_KEY_AQUI', // Substitua por sua VAPID key
  serviceWorkerRegistration: registration
});
```

### Passo 3: Testar

1. Abra `admin-notifications.html` em um navegador
2. Faça login como administrador
3. Solicite permissão para notificações
4. Teste criando um novo usuário ou post no Firebase

## 📝 Exemplo de Uso

```javascript
// O sistema automaticamente detecta novos documentos:

// Quando um novo usuário é adicionado:
// Firebase: users/{userId} - { username: 'joao', createdAt: timestamp }
// ↓
// Sistema detecta e exibe: "👤 Novo usuário: joao"
// ↓
// Notificação push: "Novo Usuário no RealMe! 🎉"

// Quando um novo post é adicionado:
// Firebase: posts/{postId} - { content: 'Olá mundo!', create: timestamp }
// ↓
// Sistema detecta e exibe: "📝 Novo post de @user: Olá mundo!"
// ↓
// Notificação push: "Novo Post no RealMe! 📝"
```

## 🐛 Troubleshooting

### Notificações não aparecem

1. **Verifique as permissões:**
   - Clique no ícone de cadeado na barra de endereço
   - Certifique-se de que notificações estão permitidas

2. **Verifique o Service Worker:**
   ```javascript
   // No console do navegador (F12):
   navigator.serviceWorker.getRegistrations().then(registrations => {
     console.log('Service Workers:', registrations);
   });
   ```

3. **Verifique se é admin:**
   - Abra o console (F12) e procure por: "✅ Acesso de administrador confirmado"

### Listeners não iniciam

1. **Verifique a conexão com Firebase:**
   - Abra o console e procure por erros do Firebase
   - Verifique se as credenciais estão corretas

2. **Verifique as coleções:**
   - Certifique-se de que as coleções `users` e `posts` existem no Firestore
   - Verifique se há documentos com os campos `createdAt` e `create`

### Erro "VAPID key not found"

- Este é um aviso esperado em desenvolvimento
- Em produção, configure a VAPID key conforme descrito acima

## 📚 Tecnologias Utilizadas

- **Firebase SDK 10.12.0**
  - Firebase App
  - Cloud Firestore
  - Firebase Cloud Messaging
  - Realtime Database

- **Service Worker API**
- **Notifications API**
- **ES6 Modules**

## 🔄 Atualizações Futuras

- [ ] Integração com Firebase Admin SDK para validação backend
- [ ] Filtros personalizáveis de eventos
- [ ] Estatísticas e métricas de eventos
- [ ] Exportação de logs
- [ ] Notificações por email
- [ ] Dashboard com gráficos em tempo real

## 👥 Suporte

Para questões ou problemas:
1. Verifique este README
2. Consulte os logs no console do navegador
3. Entre em contato com a equipe de desenvolvimento

## 📄 Licença

Este sistema faz parte do projeto RealMe.
© 2025 RealMe - Criado por Maxgfortes
