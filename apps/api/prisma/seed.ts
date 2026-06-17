import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash('Admin@123', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const admin = await prisma.user.upsert({
    where: { email: 'adriansanluz@gmail.com' },
    update: { passwordHash, role: Role.ADMIN },
    create: {
      name: 'Adrian',
      email: 'adriansanluz@gmail.com',
      passwordHash,
      role: Role.ADMIN,
    },
  });

  console.log('✓ Admin criado:', admin.email);

  const categories = [
    {
      name: 'Eletrônicos',
      slug: 'eletronicos',
      description: 'Smartphones, tablets, computadores e acessórios',
    },
    { name: 'Roupas', slug: 'roupas', description: 'Vestuário masculino e feminino' },
    { name: 'Calçados', slug: 'calcados', description: 'Sapatos, tênis e sandálias' },
    { name: 'Casa e Cozinha', slug: 'casa-cozinha', description: 'Utensílios e decoração' },
    { name: 'Esportes', slug: 'esportes', description: 'Artigos esportivos e fitness' },
    { name: 'Livros', slug: 'livros', description: 'Livros físicos e digitais' },
    { name: 'Brinquedos', slug: 'brinquedos', description: 'Brinquedos e jogos' },
    { name: 'Beleza', slug: 'beleza', description: 'Cosméticos e cuidados pessoais' },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }

  console.log(`✓ ${categories.length} categorias criadas`);

  // Legal pages initial content
  const legalPages = [
    {
      id: 'lp_termos',
      slug: 'termos-de-uso',
      title: 'Termos de Uso',
      content:
        '<h2>1. Apresentação da Plataforma</h2><p>O Saldão da Reserva é uma plataforma de e-commerce especializada na comercialização de produtos de logística reversa revisados, recondicionados e garantidos. Ao utilizar nossos serviços, você concorda com estes Termos de Uso em sua versão vigente.</p><h2>2. Cadastro de Usuários</h2><p>Para realizar compras, é necessário criar uma conta informando nome completo, e-mail válido e senha segura. O usuário é responsável pela veracidade das informações fornecidas e pela confidencialidade de suas credenciais de acesso.</p><h2>3. Foro Competente</h2><p>Para dirimir quaisquer controvérsias, fica eleito o Foro da Comarca do domicílio do consumidor, conforme o Código de Defesa do Consumidor (Lei 8.078/90).</p><p><em>Última atualização: Junho de 2026.</em></p>',
      published: true,
    },
    {
      id: 'lp_privacidade',
      slug: 'privacidade',
      title: 'Política de Privacidade',
      content:
        '<p>Esta Política descreve como o Saldão da Reserva coleta e protege seus dados pessoais em conformidade com a LGPD (Lei 13.709/2018).</p><h2>1. Dados Coletados</h2><p>Coletamos nome, e-mail, endereço de entrega, histórico de pedidos e dados de acesso (IP, navegador).</p><h2>2. Seus Direitos (LGPD)</h2><p>Você pode acessar, corrigir ou excluir seus dados a qualquer momento. Envie solicitação para privacidade@saldaodareserva.com.br.</p><p><em>Última atualização: Junho de 2026.</em></p>',
      published: true,
    },
    {
      id: 'lp_cookies',
      slug: 'cookies',
      title: 'Política de Cookies',
      content:
        '<h2>O que são cookies?</h2><p>Cookies são pequenos arquivos de texto armazenados no seu dispositivo para melhorar sua experiência de navegação.</p><h2>Cookies Necessários</h2><p>Essenciais para login e carrinho. Não podem ser desativados.</p><h2>Cookies Analíticos</h2><p>Dados anônimos para melhorar a experiência (Vercel Analytics).</p><p><em>Última atualização: Junho de 2026.</em></p>',
      published: true,
    },
    {
      id: 'lp_trocas',
      slug: 'trocas-e-devolucoes',
      title: 'Trocas e Devoluções',
      content:
        '<h2>1. Direito de Arrependimento</h2><p>Conforme o Art. 49 do CDC, você pode desistir de qualquer compra em até 7 dias corridos do recebimento, sem custo.</p><h2>2. Como Solicitar</h2><p>Acesse Minha Conta &gt; Pedidos &gt; Solicitar Devolução. Aprovamos em até 2 dias úteis e fornecemos etiqueta de devolução gratuita.</p><p><em>Última atualização: Junho de 2026.</em></p>',
      published: true,
    },
    {
      id: 'lp_entregas',
      slug: 'entregas',
      title: 'Política de Entrega',
      content:
        '<h2>Modalidades</h2><p>Entrega via Correios/transportadoras (Melhor Envio) ou retirada gratuita na loja.</p><h2>Prazos</h2><ul><li>Frete Grátis: 5-8 dias úteis (pedidos acima de R$ 300)</li><li>PAC: 5-12 dias úteis</li><li>SEDEX: 1-5 dias úteis</li></ul><h2>Rastreamento</h2><p>Código enviado por e-mail após o despacho. Acompanhe em Minha Conta &gt; Rastreamento.</p><p><em>Última atualização: Junho de 2026.</em></p>',
      published: true,
    },
    {
      id: 'lp_sobre',
      slug: 'sobre',
      title: 'Sobre Nós',
      content:
        '<h2>Nossa Missão</h2><p>Democratizar o acesso a produtos de qualidade por meio da reutilização inteligente, com economia de até 80% e garantia em todas as compras.</p><h2>Nossos Diferenciais</h2><ul><li>Produtos revisados com garantia mínima de 90 dias</li><li>NF-e em todas as compras</li><li>Frete grátis acima de R$ 300</li><li>Retirada na loja disponível</li></ul><p><em>Conteúdo editável pelo administrador.</em></p>',
      published: true,
    },
    {
      id: 'lp_contato',
      slug: 'contato',
      title: 'Contato',
      content:
        '<h2>Nossos Dados</h2><ul><li><strong>Razão Social:</strong> Saldão da Reversa SJC Ltda.</li><li><strong>CNPJ:</strong> 64.622.161/0001-08</li><li><strong>E-mail:</strong> saldaodareversasjc@gmail.com</li><li><strong>Celular:</strong> (12) 98111-6645</li><li><strong>Endereço:</strong> R. Andorra, 500, Jardim América, São José dos Campos - SP, CEP 12235-050</li></ul><h2>Horário</h2><ul><li>Segunda a Sexta: 7h às 19h</li></ul><p><em>Conteúdo editável pelo administrador.</em></p>',
      published: true,
    },
  ];

  for (const page of legalPages) {
    await prisma.legalPage.upsert({
      where: { slug: page.slug },
      update: {},
      create: page,
    });
  }

  console.log(`✓ ${legalPages.length} páginas jurídicas criadas`);

  // FAQ initial items
  const faqs = [
    {
      id: 'faq_c1',
      category: 'Compras',
      question: 'Como posso ver os detalhes completos de um produto?',
      answer:
        'Acesse a página do produto clicando no nome ou na imagem. Você verá a descrição completa, condição do item, fotos e informações de garantia.',
      position: 1,
    },
    {
      id: 'faq_c2',
      category: 'Compras',
      question: 'Posso comprar sem criar uma conta?',
      answer:
        'Não. O cadastro é obrigatório para realizar compras, pois precisamos das suas informações para processar o pedido, emitir NF-e e gerenciar entregas.',
      position: 2,
    },
    {
      id: 'faq_p1',
      category: 'Pagamentos',
      question: 'Quais formas de pagamento são aceitas?',
      answer:
        'Aceitamos PIX (aprovação imediata) e cartão de crédito (Visa, Mastercard, Elo e outros). Todos os pagamentos são processados com segurança pelo Mercado Pago.',
      position: 1,
    },
    {
      id: 'faq_p2',
      category: 'Pagamentos',
      question: 'Meu pagamento foi aprovado mas não recebi confirmação?',
      answer:
        'A confirmação pode levar alguns minutos. Verifique o spam. Se após 30 minutos não receber, acesse Minha Conta > Pedidos para verificar o status.',
      position: 2,
    },
    {
      id: 'faq_e1',
      category: 'Entregas',
      question: 'Qual o prazo de entrega?',
      answer:
        'PAC: 5-12 dias úteis, SEDEX: 1-5 dias úteis, Frete Grátis: 5-8 dias úteis. Prazos contados após confirmação do pagamento.',
      position: 1,
    },
    {
      id: 'faq_e2',
      category: 'Entregas',
      question: 'Vocês entregam em todo o Brasil?',
      answer:
        'Sim, entregamos para todos os estados brasileiros via Correios e transportadoras parceiras integradas pelo Melhor Envio.',
      position: 2,
    },
    {
      id: 'faq_t1',
      category: 'Trocas',
      question: 'Como solicitar uma troca ou devolução?',
      answer:
        'Acesse Minha Conta > Pedidos > Solicitar Devolução. Aprovamos em até 2 dias úteis e fornecemos etiqueta de devolução gratuita.',
      position: 1,
    },
    {
      id: 'faq_t2',
      category: 'Trocas',
      question: 'O frete de devolução é por minha conta?',
      answer:
        'Não. Em casos de defeito ou arrependimento dentro do prazo de 7 dias, o frete reverso é por nossa conta.',
      position: 2,
    },
    {
      id: 'faq_cc1',
      category: 'Conta',
      question: 'Como alterar minha senha?',
      answer:
        'Acesse Minha Conta > Perfil > Alterar Senha, ou use "Esqueci minha senha" na tela de login.',
      position: 1,
    },
    {
      id: 'faq_cc2',
      category: 'Conta',
      question: 'Como excluir minha conta?',
      answer:
        'Envie e-mail para privacidade@saldaodareserva.com.br com assunto "Exclusão de Conta". Processamos em até 15 dias úteis (LGPD).',
      position: 2,
    },
    {
      id: 'faq_s1',
      category: 'Segurança',
      question: 'Meus dados de pagamento ficam salvos?',
      answer:
        'Não armazenamos dados de cartão. Todas as transações são processadas pelo Mercado Pago (certificado PCI DSS nível 1).',
      position: 1,
    },
    {
      id: 'faq_s2',
      category: 'Segurança',
      question: 'Como reportar uma atividade suspeita?',
      answer:
        'Altere sua senha imediatamente e contate seguranca@saldaodareserva.com.br descrevendo o ocorrido.',
      position: 2,
    },
  ];

  for (const faq of faqs) {
    await prisma.faq.upsert({
      where: { id: faq.id },
      update: {},
      create: { ...faq, active: true },
    });
  }

  console.log(`✓ ${faqs.length} itens de FAQ criados`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
