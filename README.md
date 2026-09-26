# Meu Checkout

Checkout próprio para venda de infoprodutos (e-books) com Mercado Pago (Pix) e Supabase.

## Status atual

- Frontend publicado no GitHub Pages
- Criação de pedidos e pagamentos Pix funcionando
- Webhook do Mercado Pago funcionando
- Página de sucesso com verificação de pagamento
- **Entrega segura de e-books** via Signed URL (bucket privado)
- Registro de downloads para métricas futuras

## Estrutura

```
public/
  index.html          → Página do produto
  checkout.html       → Checkout (aceita ?produto=ID)
  sucesso.html        → Confirmação + botão de download seguro

supabase/
  functions/
    gerar-download/   → Edge Function que gera Signed URL
  sql/
    001_add_arquivo_path_and_downloads.sql
```

## Como usar (múltiplos produtos)

```
https://seu-site.github.io/meu-checkout/checkout.html?produto=1
https://seu-site.github.io/meu-checkout/checkout.html?produto=2
```

## Configuração necessária (Dashboard Supabase)

### 1. Execute o SQL

Vá em **SQL Editor** e execute o conteúdo de:

`supabase/sql/001_add_arquivo_path_and_downloads.sql`

### 2. Crie o bucket privado

1. Vá em **Storage**
2. Crie um bucket chamado `ebooks`
3. **Public bucket: desligado**
4. File size limit: 50 MB (ou o valor desejado)
5. Allowed MIME types: `application/pdf` (opcional)

### 3. Faça upload de um PDF de teste

1. Entre no bucket `ebooks`
2. Faça upload de um arquivo (ex: `teste.pdf`)
3. Atualize o produto:

```sql
UPDATE produtos
SET arquivo_path = 'teste.pdf'
WHERE id = 1;
```

### 4. Crie a Edge Function `gerar-download`

1. Vá em **Edge Functions**
2. Crie uma nova função chamada `gerar-download`
3. Cole o conteúdo de `supabase/functions/gerar-download/index.ts`
4. Implante a função
5. Certifique-se de que as variáveis de ambiente `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão disponíveis (padrão no Supabase)

### 5. Teste o fluxo completo

1. Acesse a página de checkout
2. Gere um Pix de teste
3. Confirme o pagamento no painel do Mercado Pago Sandbox
4. Na página de sucesso, clique em **Baixar meu e-book**
5. O sistema deve gerar uma Signed URL temporária (1 hora) e registrar o download

## Segurança

- Bucket `ebooks` é privado
- Download só é liberado após validar:
  - Pedido existe
  - Status = `processed` ou `approved`
  - Produto ativo e com `arquivo_path`
- Signed URL com expiração de 1 hora
- Service role usado apenas nas Edge Functions
- Nenhum secret no frontend
- Tabela `downloads` registra cada solicitação válida (preparada para dashboard futuro)

## Próximos passos (não implementados ainda)

- Dashboard administrativo (vendas, pedidos, pagamentos, downloads)
- Listagem dinâmica de produtos na home
- Melhorias visuais
- Migração Mercado Pago para produção
