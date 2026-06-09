-- CreateTable: legal_pages
CREATE TABLE "legal_pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "legal_pages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legal_pages_slug_key" ON "legal_pages"("slug");

-- CreateTable: faqs
CREATE TABLE "faqs" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: user_consents
CREATE TABLE "user_consents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "document_version" INTEGER NOT NULL DEFAULT 1,
    "ip_address" TEXT,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_consents_user_id_idx" ON "user_consents"("user_id");

ALTER TABLE "user_consents"
    ADD CONSTRAINT "user_consents_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed initial legal pages
INSERT INTO "legal_pages" ("id", "slug", "title", "content", "published", "version", "created_at", "updated_at")
VALUES (
  'lp_termos',
  'termos-de-uso',
  'Termos de Uso',
  $content$<h2>1. Apresentação da Plataforma</h2>
<p>O Saldão da Reserva é uma plataforma de e-commerce especializada na comercialização de produtos de logística reversa revisados, recondicionados e garantidos. Ao utilizar nossos serviços, você concorda com estes Termos de Uso em sua versão vigente.</p>

<h2>2. Cadastro de Usuários</h2>
<p>Para realizar compras, é necessário criar uma conta informando nome completo, e-mail válido e senha segura. O usuário é responsável pela veracidade das informações fornecidas e pela confidencialidade de suas credenciais de acesso.</p>

<h2>3. Responsabilidades do Usuário</h2>
<p>O usuário se compromete a: fornecer informações verdadeiras no cadastro; utilizar a plataforma de forma lícita; não compartilhar credenciais de acesso; não utilizar mecanismos automatizados para acessar o sistema; e respeitar os direitos de terceiros.</p>

<h2>4. Responsabilidades da Empresa</h2>
<p>O Saldão da Reserva se compromete a: disponibilizar a plataforma com segurança razoável; descrever os produtos com precisão sobre seu estado e origem; processar pedidos conforme os prazos informados; emitir nota fiscal para todas as compras; e oferecer suporte ao cliente nos canais oficiais.</p>

<h2>5. Uso Permitido</h2>
<p>A plataforma destina-se exclusivamente a compras para uso pessoal ou empresarial lícito. É permitido pesquisar produtos, realizar pedidos, acompanhar entregas e solicitar devoluções conforme nossa política vigente.</p>

<h2>6. Uso Proibido</h2>
<p>É expressamente proibido: realizar pedidos fraudulentos; utilizar dados de pagamento de terceiros sem autorização; tentar comprometer a segurança ou disponibilidade da plataforma; efetuar chargebacks indevidos; e praticar qualquer ato contrário às leis brasileiras.</p>

<h2>7. Propriedade Intelectual</h2>
<p>Todo o conteúdo da plataforma — marca, logotipos, textos, imagens, código-fonte e design — é de propriedade exclusiva do Saldão da Reserva e está protegido por legislação de direitos autorais e propriedade intelectual. É vedada qualquer reprodução sem autorização expressa e por escrito.</p>

<h2>8. Suspensão de Contas</h2>
<p>Reservamo-nos o direito de suspender ou encerrar contas, sem aviso prévio em casos graves, quando identificadas: violação destes Termos; atividades fraudulentas; chargebacks indevidos; ou conduta contrária às leis brasileiras.</p>

<h2>9. Cancelamento de Contas</h2>
<p>O usuário pode solicitar o cancelamento de sua conta a qualquer momento pelo e-mail contato@saldaodareserva.com.br. Pedidos em andamento serão concluídos antes do encerramento. Dados pessoais serão retidos conforme exigências legais (até 5 anos para dados fiscais).</p>

<h2>10. Limitação de Responsabilidade</h2>
<p>O Saldão da Reserva não se responsabiliza por danos decorrentes de uso indevido da plataforma, falhas de terceiros (transportadoras, gateways de pagamento, provedores de internet) ou casos fortuitos e de força maior. Nossa responsabilidade se limita ao valor da compra efetivamente realizada.</p>

<h2>11. Alterações dos Termos</h2>
<p>Estes Termos podem ser atualizados periodicamente. Alterações relevantes serão comunicadas por e-mail com antecedência razoável. O uso contínuo da plataforma após as alterações implica aceite automático dos novos Termos.</p>

<h2>12. Foro Competente</h2>
<p>Para dirimir quaisquer controvérsias decorrentes destes Termos, fica eleito o Foro da Comarca do domicílio do consumidor, conforme o Código de Defesa do Consumidor (Lei 8.078/90), com renúncia a qualquer outro, por mais privilegiado que seja.</p>

<p><em>Última atualização: Junho de 2026. Versão 1.0.</em></p>$content$,
  true,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'lp_privacidade',
  'privacidade',
  'Política de Privacidade',
  $content2$<p>Esta Política de Privacidade descreve como o Saldão da Reserva coleta, utiliza, armazena e protege seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018) e demais legislações aplicáveis.</p>

<h2>1. Dados Coletados</h2>
<p>Coletamos os seguintes dados pessoais: nome completo, endereço de e-mail, endereço de entrega (CEP, rua, número, bairro, cidade, estado), dados de pagamento (processados pelo Mercado Pago — não armazenamos dados de cartão), histórico de pedidos e dados de acesso (endereço IP, navegador, data e hora de acesso).</p>

<h2>2. Finalidade da Coleta</h2>
<p>Seus dados são utilizados para: processamento e entrega de pedidos; emissão de Nota Fiscal Eletrônica (NF-e); comunicações transacionais (confirmação de pedido, rastreamento, NF-e); atendimento ao cliente; prevenção de fraudes; e cumprimento de obrigações legais e regulatórias.</p>

<h2>3. Compartilhamento de Dados</h2>
<p>Compartilhamos dados estritamente necessários com: <strong>Mercado Pago</strong> (processamento de pagamentos); <strong>Melhor Envio / transportadoras parceiras</strong> (entrega de produtos); <strong>Focus NFe</strong> (emissão de nota fiscal eletrônica); <strong>Resend</strong> (envio de e-mails transacionais). Não vendemos, alugamos ou compartilhamos seus dados com terceiros para fins de marketing sem seu consentimento.</p>

<h2>4. Armazenamento</h2>
<p>Seus dados são armazenados em servidores seguros na infraestrutura Railway (AWS), com criptografia em trânsito e em repouso. Os dados são retidos pelo tempo necessário para cumprimento das finalidades descritas e das obrigações legais: dados fiscais por 5 anos (obrigação tributária), dados de conta por até 2 anos após encerramento.</p>

<h2>5. Segurança</h2>
<p>Adotamos as seguintes medidas de segurança: criptografia TLS/HTTPS em todas as comunicações; hashing de senhas com Argon2id (memória 64MB, 3 iterações); controle de acesso baseado em funções (RBAC); rate limiting para prevenção de ataques; e logs de auditoria de todas as operações sensíveis.</p>

<h2>6. Direitos do Titular (LGPD)</h2>
<p>Nos termos da LGPD (Art. 18), você tem direito a: confirmar a existência de tratamento; acessar seus dados; corrigir dados incompletos ou incorretos; solicitar anonimização, bloqueio ou eliminação de dados desnecessários; revogar o consentimento a qualquer momento; e obter portabilidade dos dados a outro fornecedor.</p>

<h2>7. Como Exercer Seus Direitos</h2>
<p>Para exercer seus direitos LGPD, envie e-mail para <strong>privacidade@saldaodareserva.com.br</strong> com assunto "Solicitação LGPD", informando seu nome completo e CPF. Responderemos em até 15 dias úteis, conforme prazo legal.</p>

<h2>8. Exclusão de Dados</h2>
<p>Você pode solicitar a exclusão de seus dados pessoais a qualquer momento. Exceto quando a retenção for exigida por lei (dados fiscais por 5 anos, dados de transação por 2 anos), seus dados serão removidos permanentemente em até 30 dias após a solicitação.</p>

<h2>9. Cookies</h2>
<p>Utilizamos cookies funcionais (essenciais para login e carrinho), analíticos (Vercel Analytics, dados anônimos) e de marketing (somente com consentimento explícito). Consulte nossa Política de Cookies para detalhes completos.</p>

<h2>10. Contato do Encarregado de Dados (DPO)</h2>
<p>Encarregado de Proteção de Dados: responsável@saldaodareserva.com.br<br>
Para questões relacionadas à privacidade e proteção de dados, entre em contato pelo e-mail acima.</p>

<p><em>Última atualização: Junho de 2026. Esta política está em conformidade com a LGPD (Lei 13.709/2018).</em></p>$content2$,
  true,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'lp_cookies',
  'cookies',
  'Política de Cookies',
  $content3$<p>Esta Política de Cookies explica o que são cookies, como os utilizamos no Saldão da Reserva e como você pode gerenciar suas preferências.</p>

<h2>1. O que são cookies?</h2>
<p>Cookies são pequenos arquivos de texto armazenados no seu dispositivo (computador, tablet ou smartphone) quando você visita um site. Eles permitem que o site reconheça seu dispositivo em visitas futuras, mantendo preferências e melhorando sua experiência.</p>

<h2>2. Cookies Necessários</h2>
<p>Indispensáveis para o funcionamento básico do site. Incluem: cookie de sessão de autenticação (mantém você logado), carrinho de compras temporário e preferências de interface. <strong>Estes cookies não podem ser desativados</strong> sem comprometer o funcionamento do site. Não coletam informações pessoais identificáveis além do necessário para a sessão.</p>

<h2>3. Cookies Analíticos</h2>
<p>Utilizamos o Vercel Analytics para entender como os visitantes interagem com nosso site. Estes cookies coletam dados anônimos e agregados, como: páginas visitadas, tempo de permanência, taxas de rejeição e origem do acesso. Nenhum dado pessoal identificável é compartilhado. Você pode recusar estes cookies sem impacto na funcionalidade do site.</p>

<h2>4. Cookies de Marketing</h2>
<p>Cookies de marketing são utilizados para personalizar anúncios e medir a eficácia de campanhas. <strong>Estes cookies são ativados somente com seu consentimento explícito</strong>. Se você não consentir, não serão instalados cookies de marketing em seu dispositivo.</p>

<h2>5. Como Desativar Cookies</h2>
<p>Você pode gerenciar e desativar cookies nas configurações do seu navegador:</p>
<ul>
<li><strong>Google Chrome:</strong> Configurações &gt; Privacidade e segurança &gt; Cookies</li>
<li><strong>Mozilla Firefox:</strong> Preferências &gt; Privacidade e Segurança</li>
<li><strong>Safari:</strong> Preferências &gt; Privacidade</li>
<li><strong>Microsoft Edge:</strong> Configurações &gt; Cookies e permissões do site</li>
</ul>
<p>Atenção: desativar cookies necessários pode impedir o login e o funcionamento do carrinho de compras.</p>

<h2>6. Gerenciamento de Consentimento</h2>
<p>Ao acessar o Saldão da Reserva pela primeira vez, exibimos um banner de consentimento de cookies. Você pode: <strong>Aceitar tudo</strong> (ativa todos os cookies); <strong>Recusar opcionais</strong> (mantém apenas cookies necessários); ou <strong>Personalizar</strong> (escolha granular por categoria). Suas preferências ficam salvas por 12 meses e podem ser alteradas a qualquer momento clicando em "Gerenciar Cookies" no rodapé do site.</p>

<p><em>Última atualização: Junho de 2026.</em></p>$content3$,
  true,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'lp_trocas',
  'trocas-e-devolucoes',
  'Trocas e Devoluções',
  $content4$<p>O Saldão da Reserva respeita integralmente o Código de Defesa do Consumidor (Lei 8.078/90) e se compromete a oferecer um processo de trocas e devoluções simples e transparente.</p>

<h2>1. Direito de Arrependimento</h2>
<p>Conforme o Art. 49 do Código de Defesa do Consumidor, você tem o direito de desistir de qualquer compra realizada pela internet em até <strong>7 (sete) dias corridos</strong> a partir da data de recebimento do produto, sem necessidade de justificativa e sem qualquer custo adicional.</p>

<h2>2. Prazo Legal de 7 Dias</h2>
<p>O prazo de arrependimento começa a contar a partir da data comprovada de entrega do produto (conforme registro da transportadora). A solicitação deve ser registrada dentro do prazo, podendo ser feita em "Minha Conta &gt; Meus Pedidos &gt; Solicitar Devolução" ou pelo e-mail trocas@saldaodareserva.com.br.</p>

<h2>3. Processo de Devolução</h2>
<p>Para solicitar uma devolução: (1) acesse Minha Conta &gt; Pedidos &gt; Solicitar Devolução; (2) selecione o motivo e descreva o problema; (3) aguarde a aprovação em até 2 dias úteis; (4) imprima a etiqueta de devolução fornecida (frete reverso gratuito nos casos previstos); (5) poste o produto nos Correios em até 5 dias úteis após a aprovação.</p>

<h2>4. Processo de Troca</h2>
<p>Solicitações de troca por outro produto estão sujeitas à disponibilidade em estoque. Após recebermos e verificarmos o produto devolvido (até 5 dias úteis), enviaremos o novo produto sem custo adicional de frete, com prazo de entrega normal a partir da data de despacho.</p>

<h2>5. Produtos com Defeito</h2>
<p>Produtos com defeito de fabricação ou vício oculto são cobertos pela garantia legal: <strong>90 dias</strong> para produtos duráveis e <strong>30 dias</strong> para produtos não duráveis (contados da data de recebimento). Após análise técnica, oferecemos reparo, substituição por produto equivalente ou reembolso integral, conforme preferência do consumidor.</p>

<h2>6. Reembolso</h2>
<p>O reembolso é processado via Mercado Pago em até <strong>10 dias úteis</strong> após a confirmação do recebimento e análise do produto devolvido. O prazo para o crédito aparecer em sua fatura ou conta bancária pode ser maior, dependendo da sua instituição financeira (geralmente de 1 a 2 faturas para cartão de crédito).</p>

<h2>7. Logística Reversa (Frete de Devolução)</h2>
<p>Disponibilizamos etiqueta de postagem pré-paga (frete por nossa conta) para: devoluções por arrependimento dentro do prazo legal de 7 dias; produtos com defeito comprovado; envio incorreto de produto. Para trocas voluntárias fora do prazo de arrependimento, o frete de retorno pode ser cobrado dependendo do caso.</p>

<h2>8. Prazos Resumidos</h2>
<ul>
<li><strong>Solicitação:</strong> até 7 dias após o recebimento (arrependimento) ou conforme garantia (defeito)</li>
<li><strong>Aprovação:</strong> até 2 dias úteis após a solicitação</li>
<li><strong>Postagem pelo cliente:</strong> até 5 dias úteis após a aprovação</li>
<li><strong>Análise após recebimento:</strong> até 5 dias úteis</li>
<li><strong>Reembolso ou envio da troca:</strong> até 10 dias úteis após análise</li>
</ul>

<h2>9. Exceções</h2>
<p>Não aceitamos devoluções de: produtos personalizados ou sob medida; produtos com embalagem violada por uso indevido (além da avaliação normal); produtos com danos causados por mau uso comprovado; e softwares ou conteúdos digitais que já tenham sido ativados ou utilizados.</p>

<p><em>Última atualização: Junho de 2026. Em conformidade com o Código de Defesa do Consumidor (Lei 8.078/90).</em></p>$content4$,
  true,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'lp_entregas',
  'entregas',
  'Política de Entrega',
  $content5$<p>O Saldão da Reserva trabalha para garantir que seus produtos cheguem com segurança e dentro do prazo. Confira abaixo todas as informações sobre nossas modalidades de entrega.</p>

<h2>1. Modalidades de Entrega</h2>
<p>Oferecemos duas formas de recebimento: <strong>Entrega em domicílio</strong> (via transportadoras parceiras) e <strong>Retirada na Loja</strong> (grátis, sem custo de frete). A opção de retirada está disponível para pedidos destinados à nossa loja física.</p>

<h2>2. Entrega via Melhor Envio</h2>
<p>Para entregas em domicílio, utilizamos o <strong>Melhor Envio</strong> para cotação em tempo real com Correios (PAC e SEDEX) e transportadoras privadas. O frete é calculado automaticamente no checkout com base no CEP de destino, peso e dimensões dos itens do pedido. Oferecemos <strong>frete grátis</strong> para pedidos acima de R$ 300,00.</p>

<h2>3. Retirada na Loja</h2>
<p>Disponível sem custo de frete. Após a confirmação do pagamento, sua equipe separará o pedido em 1 a 2 dias úteis. Você receberá um e-mail com o <strong>código de retirada</strong> assim que o pedido estiver pronto. Basta apresentar o código (ou CPF) no balcão de atendimento. O pedido fica disponível por 7 dias corridos.</p>

<h2>4. Prazos de Entrega</h2>
<p>Os prazos são estimados e contados a partir da confirmação do pagamento (não da data do pedido):</p>
<ul>
<li><strong>Frete Grátis:</strong> 5 a 8 dias úteis (pedidos acima de R$ 300)</li>
<li><strong>Correios PAC:</strong> 5 a 12 dias úteis conforme destino</li>
<li><strong>Correios SEDEX:</strong> 1 a 5 dias úteis conforme destino</li>
<li><strong>Transportadoras privadas:</strong> conforme cotação exibida no checkout</li>
<li><strong>Retirada na Loja:</strong> 1 a 2 dias úteis após a confirmação do pagamento</li>
</ul>

<h2>5. Rastreamento</h2>
<p>Após o despacho do pedido, você receberá o <strong>código de rastreamento</strong> por e-mail. O acompanhamento pode ser feito em <strong>Minha Conta &gt; Rastreamento</strong> em nosso site ou diretamente no site dos Correios ou da transportadora. As atualizações de rastreamento podem levar até 24 horas para aparecer após a postagem.</p>

<h2>6. Tentativas de Entrega</h2>
<p>Os Correios e transportadoras parceiras realizam <strong>até 3 tentativas de entrega</strong> em dias úteis. Se não houver sucesso nas tentativas, o pacote ficará disponível para retirada na agência por até 7 dias corridos antes de ser devolvido ao remetente. Em caso de devolução, entraremos em contato para reagendar o envio (pode haver cobrança de novo frete).</p>

<h2>7. Problemas de Entrega</h2>
<p>Em caso de atraso significativo, produto extraviado ou avaria durante o transporte, entre em contato pelo e-mail suporte@saldaodareserva.com.br informando o número do pedido. Investigaremos junto à transportadora e, se confirmado o problema, enviaremos um novo produto ou processaremos o reembolso integral, sem custo para você.</p>

<p><em>Última atualização: Junho de 2026.</em></p>$content5$,
  true,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'lp_sobre',
  'sobre',
  'Sobre Nós',
  $content6$<h2>Nossa História</h2>
<p>O Saldão da Reserva nasceu da convicção de que produtos em bom estado não devem ir para o descarte. Especializados em logística reversa, adquirimos produtos devolvidos ao varejo, realizamos revisão criteriosa e os disponibilizamos com garantia e economia de até 80% do preço original.</p>
<p>Acreditamos que consumo responsável e economia não são excludentes — pelo contrário, caminham juntos quando há transparência e qualidade.</p>

<h2>Nossa Missão</h2>
<p>Democratizar o acesso a produtos de qualidade por meio da reutilização inteligente, reduzindo o desperdício e oferecendo preços justos para todos os brasileiros.</p>

<h2>Nossos Valores</h2>
<ul>
<li><strong>Transparência:</strong> descrevemos cada produto com honestidade sobre sua origem e estado.</li>
<li><strong>Sustentabilidade:</strong> cada produto vendido é um produto que não foi descartado.</li>
<li><strong>Qualidade:</strong> todos os itens passam por inspeção antes de serem listados.</li>
<li><strong>Segurança:</strong> compra protegida, pagamento seguro e garantia real em todos os produtos.</li>
<li><strong>Acessibilidade:</strong> preços que fazem a diferença no bolso de quem compra.</li>
</ul>

<h2>Nossos Diferenciais</h2>
<ul>
<li>Produtos revisados com garantia mínima de 90 dias</li>
<li>Nota Fiscal Eletrônica em todas as compras</li>
<li>Frete grátis para pedidos acima de R$ 300</li>
<li>Retirada na loja disponível (frete zero)</li>
<li>Atendimento humano de segunda a sexta, das 8h às 20h</li>
<li>Devolução simplificada com frete reverso grátis no prazo legal</li>
</ul>

<p><em>Este conteúdo pode ser editado pelo administrador no painel de controle.</em></p>$content6$,
  true,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'lp_contato',
  'contato',
  'Contato',
  $content7$<h2>Nossos Dados</h2>
<ul>
<li><strong>Razão Social:</strong> Saldão da Reserva Comércio Eletrônico Ltda.</li>
<li><strong>Nome Fantasia:</strong> Saldão da Reserva</li>
<li><strong>CNPJ:</strong> 00.000.000/0001-00</li>
<li><strong>E-mail:</strong> contato@saldaodareserva.com.br</li>
<li><strong>Telefone/WhatsApp:</strong> (00) 00000-0000</li>
<li><strong>Endereço:</strong> Rua Exemplo, 123 — Bairro — Cidade/UF — CEP 00000-000</li>
</ul>

<h2>Horário de Atendimento</h2>
<ul>
<li>Segunda a Sexta: 8h às 20h</li>
<li>Sábado: 9h às 15h</li>
<li>Domingos e feriados: não há atendimento</li>
</ul>

<p><em>Este conteúdo pode ser editado pelo administrador no painel de controle.</em></p>$content7$,
  true,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Seed initial FAQ items
INSERT INTO "faqs" ("id", "category", "question", "answer", "position", "active", "created_at", "updated_at")
VALUES
  ('faq_c1', 'Compras', 'Como posso ver os detalhes completos de um produto?', 'Acesse a página do produto clicando no nome ou na imagem. Você verá a descrição completa, condição do item, fotos, informações de garantia e disponibilidade em estoque.', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('faq_c2', 'Compras', 'Posso comprar sem criar uma conta?', 'Não. O cadastro é obrigatório para realizar compras, pois precisamos de suas informações para processar o pedido, emitir nota fiscal e gerenciar entregas e devoluções.', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('faq_p1', 'Pagamentos', 'Quais formas de pagamento são aceitas?', 'Aceitamos PIX (aprovação imediata) e cartão de crédito (Visa, Mastercard, Elo, Hipercard e outras bandeiras principais). Todos os pagamentos são processados com segurança pelo Mercado Pago.', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('faq_p2', 'Pagamentos', 'Meu pagamento foi aprovado mas não recebi confirmação por e-mail?', 'A confirmação pode levar alguns minutos. Verifique também sua caixa de spam. Se após 30 minutos não receber o e-mail, acesse "Minha Conta > Pedidos" para verificar o status. Se o problema persistir, entre em contato com nosso suporte.', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('faq_e1', 'Entregas', 'Qual o prazo de entrega?', 'Os prazos variam conforme a modalidade: PAC (5-12 dias úteis), SEDEX (1-5 dias úteis) e transportadoras privadas conforme cotação. O frete grátis tem prazo de 5-8 dias úteis. Os prazos são contados após a confirmação do pagamento.', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('faq_e2', 'Entregas', 'Vocês entregam em todo o Brasil?', 'Sim, entregamos para todos os estados brasileiros via Correios e transportadoras parceiras integradas pelo Melhor Envio. O frete e prazo são calculados automaticamente no checkout pelo CEP de destino.', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('faq_t1', 'Trocas', 'Como solicitar uma troca ou devolução?', 'Acesse Minha Conta > Pedidos > e clique em "Solicitar Devolução" no pedido desejado. Selecione o motivo, descreva o problema e envie. Aprovamos em até 2 dias úteis e fornecemos etiqueta de devolução gratuita.', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('faq_t2', 'Trocas', 'O frete de devolução é por minha conta?', 'Não. Em casos de defeito, produto errado enviado ou arrependimento dentro do prazo legal de 7 dias, o frete reverso (devolução) é 100% por nossa conta. Fornecemos etiqueta de postagem pré-paga.', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('faq_cc1', 'Conta', 'Como alterar minha senha?', 'Acesse Minha Conta > Perfil e clique em "Alterar Senha". Você precisará informar a senha atual e a nova senha. Também é possível redefinir a senha pela opção "Esqueci minha senha" na tela de login.', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('faq_cc2', 'Conta', 'Como excluir minha conta?', 'Para excluir sua conta, envie um e-mail para privacidade@saldaodareserva.com.br com assunto "Exclusão de Conta" informando seu nome completo e CPF. Processaremos sua solicitação em até 15 dias úteis, conforme a LGPD.', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('faq_s1', 'Segurança', 'Meus dados de pagamento ficam salvos no site?', 'Não armazenamos dados de cartão de crédito. Todas as transações são processadas diretamente pelo Mercado Pago, que é certificado PCI DSS nível 1 — o mais alto padrão de segurança para pagamentos.', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('faq_s2', 'Segurança', 'Como reportar uma atividade suspeita na minha conta?', 'Se identificar qualquer atividade suspeita, altere sua senha imediatamente e entre em contato pelo e-mail seguranca@saldaodareserva.com.br descrevendo o ocorrido. Nossa equipe responderá com prioridade.', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
