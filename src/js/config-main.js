const conteudosConfig = {
  conta: `
    <h2>Configurações de Conta</h2>
    <form class="config-form">
      <div class="form-field">
        <label>Email:</label>
        <input type="email" placeholder="seuemail@exemplo.com" />
      </div>
      <div class="form-field">
        <label>Número de telefone:</label>
        <input type="tel" placeholder="(00) 00000-0000" />
      </div>
      <div class="form-field">
      <div class="form-field">
        <label>Senha atual:</label>
        <input type="password" />
      </div>
      <div class="form-field">
        <label>Nova senha:</label>
        <input type="password" />
      </div>
      <button class="button-del" type="delete">Excluir conta permanentemente</button>
      <button class="button-bar" type="submit">Salvar alterações</button>
    </form>
  `,
  privacidade: `
    <h2>Privacidade</h2>
    <form class="config-form">
      <div class="form-field">
        <label>Quem pode ver meu perfil:</label>
        <select>
          <option>Público</option>
          <option>Amigos</option>
          <option>Somente eu</option>
        </select>
      </div>
      <div class="form-field">
        <label>Quem pode me enviar mensagens:</label>
        <select>
          <option>Todos</option>
          <option>Apenas amigos</option>
          <option>Ninguém</option>
        </select>
      </div>
      <div class="form-field">
        <label>Quem pode ver minha lista de amigos:</label>
        <select>
          <option>Público</option>
          <option>Somente eu</option>
        </select>
      </div>
      <div class="form-field switch-group">
        <label>Ocultar data de nascimento e status online:</label>
        <label class="switch">
          <input type="checkbox" />
          <span class="slider round"></span>
        </label>
      </div>
      <div class="form-field switch-group">
        <label>Ativar modo anônimo:</label>
        <label class="switch">
          <input type="checkbox" />
          <span class="slider round"></span>
        </label>
      </div>
      <div class="form-field switch-group">
        <label>Solicitações de amizade automática:</label>
        <label class="switch">
          <input type="checkbox" />
          <span class="slider round"></span>
        </label>
      </div>
      <button class="button-bar" type="submit">Salvar preferências</button>
    </form>
  `,
  perfil:
  `
    <h2>Configurações de Perfil</h2>
    <form class="config-form">
      <div class="form-field">
        <label>Nome de Usuario:</label>
        <input type="email" placeholder="meu-username" />
      </div>
      <div class="form-field">
        <label>Nome visivel:</label>
        <input type="tel" placeholder="meu-nome" />
      </div>
      <div class="form-field">
        <label>Pronome 1:</label>
        <input type="texts" />
      </div>
      <div class="form-field">
        <label>Pronome 2:</label>
        <input type="texts" />
      </div>
      <div class="form-field">
        <label>Estado Civil:</label>
        <select>
          <option>Solteiro</option>
          <option>em Compromiso</option>
          <option>Namorando</option>
          <option>Casado</option>
        </select>
<div class="form-field">
  <label for="tagSelect">Tags:</label>
  <select id="tagSelect" class="styled-select">
    <option>Cool</option>
    <option>Y2K</option>
    <option>Goth</option>
    <option>SK8</option>
    <option>New</option>
  </select>
</div>


      <div class="form-field">
        <label>Localização:</label>
        <input type="texts" />
      </div>
      <div class="form-field">
        <label>Visão Geral:</label>
        <input type="texts" />
      </div>
      <div class="form-field">
        <label>Estilo:</label>
        <input type="texts" />
      </div>
      <div class="form-field">
        <label>Sonhos e desejos:</label>
        <input type="texts" />
      </div>
      <div class="form-field">
        <label>Medos:</label>
        <input type="texts" />
      </div>
      <div class="form-field">
        <label>Personalidade:</label>
        <input type="texts" />
      </div>
      <h2>Meus Gostos</h2>
      <label>Musicas:</label>
        <input type="texts" />
      </div>
      <div class="form-field">
        <label>Filmes e Series:</label>
        <input type="texts" />
      </div>
      <div class="form-field">
        <label>Livros:</label>
        <input type="texts" />
      </div>
      <div class="form-field">
        <label>Personagens:</label>
        <input type="texts" />
      </div>
      <div class="form-field">
        <label>Comidas e Bebidas:</label>
        <input type="texts" />
      </div>
      <div class="form-field">
        <label>Hobbies:</label>
        <input type="texts" />
      </div>
      <div class="form-field">
        <label>Jogos favoritos:</label>
        <input type="texts" />
      </div>
      <div class="form-field">
        <label>Outros gostos:</label>
        <input type="texts" />
      </div>
      <div class="form-field switch-group">
        <label>Desativar Depoimentos</label>
        <label class="switch">
          <input type="checkbox" />
          <span class="slider round"></span>
        </label>
      </div>
      <button class="button-bar" type="submit">Salvar alterações</button>
    </form>
  `,
  notificacoes: `
    <h2>Notificações</h2>
    <form class="config-form">
      <div class="form-field switch-group">
        <label>Notificações push no celular:</label>
        <label class="switch">
          <input type="checkbox" />
          <span class="slider round"></span>
        </label>
      </div>
      <div class="form-field switch-group">
        <label>Alertas de curtidas/comentários:</label>
        <label class="switch">
          <input type="checkbox" checked />
          <span class="slider round"></span>
        </label>
      </div>
      <div class="form-field switch-group">
        <label>Novos seguidores/amigos:</label>
        <label class="switch">
          <input type="checkbox" checked />
          <span class="slider round"></span>
        </label>
      </div>
      <div class="form-field switch-group">
        <label>Alertas de segurança:</label>
        <label class="switch">
          <input type="checkbox" />
          <span class="slider round"></span>
        </label>
      </div>
      <button class="button-bar" type="submit">Salvar notificações</button>
    </form>
  `,
  seguranca: `
    <h2>Segurança</h2>
    <form class="config-form">
      <div class="form-field">
        <label>Sessões ativas:</label>
        <button class="button-bar" type="button">Ver dispositivos</button>
      </div>
      <div class="form-field switch-group">
        <label>Sair de todos os dispositivos:</label>
        <label class="switch">
          <input type="checkbox" />
          <span class="slider round"></span>
        </label>
      </div>
      <div class="form-field">
        <label>Senha atual:</label>
        <input type="password" placeholder="Confirme para alterar" />
      </div>
      <button class="button-bar" type="submit">Atualizar segurança</button>
    </form>
  `,
  aparencia: `
    <h2>Aparência</h2>
    <form class="config-form">
      <div class="form-field">
        <label>Escolher tema:</label>
        <select>
          <option>Claro</option>
          <option selected>Escuro</option>
          <option>Automático</option>
        </select>
      </div>
      <div class="form-field">
        <label>Tamanho da fonte:</label>
        <input type="range" min="12" max="24" value="16" />
      </div>
      <div class="form-field switch-group">
        <label>Modo acessível (alto contraste):</label>
        <label class="switch">
          <input type="checkbox" />
          <span class="slider round"></span>
        </label>
      </div>
      <div class="form-field">
        <label>Cor de destaque:</label>
        <input type="color" value="#4A90E2" />
      </div>
      <button class="button-bar" type="submit">Salvar aparência</button>
    </form>
  `,
  idioma: `
    <h2>Idioma e Região</h2>
    <form class="config-form">
      <div class="form-field">
        <label>Idioma:</label>
        <select>
          <option selected>Português (BR)</option>
          <option>Inglês</option>
          <option>Espanhol</option>
        </select>
      </div>
      <div class="form-field">
        <label>Formato de data/hora:</label>
        <select>
          <option>DD/MM/AAAA</option>
          <option>MM/DD/YYYY</option>
        </select>
      </div>
      <div class="form-field">
        <label>Fuso horário:</label>
        <select>
          <option>-03:00 Brasília</option>
          <option>-05:00 Bogotá</option>
          <option>+01:00 Lisboa</option>
        </select>
      </div>
      <button class="button-bar"  type="submit">Salvar região</button>
    </form>
  `,
  ajuda: `
    <h2>Ajuda & Suporte</h2>
    <form class="config-form">
      <div class="form-field">
        <label>Relatar um problema:</label>
        <textarea rows="4" placeholder="Descreva o problema... (max 120 caracteres)"></textarea>
      </div>
      <button class="button-bar" type="submit">Enviar</button>
    </form>
    <p>
      <a href="#">Termos de Uso</a> • 
      <a href="#">Política de Privacidade</a>
    </p>
  `
};



  const listaItens = document.querySelectorAll(".config-sidebar li");
  const areaConteudo = document.querySelector(".config-content");

  listaItens.forEach(item => {
    item.addEventListener("click", () => {
      const secao = item.getAttribute("data-section");

      // Atualiza o conteúdo
      areaConteudo.innerHTML = conteudosConfig[secao] || "<p>Conteúdo não disponível.</p>";

      // Marca o item selecionado
      listaItens.forEach(li => li.classList.remove("ativo"));
      item.classList.add("ativo");
    });
  });

  