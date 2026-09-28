-- ============================================
-- Produto de TESTE - R$ 0,05
-- NÃO altera o produto de produção (id=1 / R$ 19,90)
--
-- ANTES de executar:
-- 1. Storage > bucket privado "ebooks"
-- 2. Upload do arquivo: teste-checkout.pdf
-- 3. Confirme que o path é exatamente: teste-checkout.pdf
--    (mesmo padrão do arquivo_path do produto 1)
--
-- Depois: SQL Editor > cole este arquivo > Run
-- ============================================

-- 0) Conferir produtos atuais (só leitura)
SELECT id, nome, preco, ativo, arquivo_path
FROM public.produtos
ORDER BY id;

-- 1) Inserir produto de teste (idempotente pelo slug)
INSERT INTO public.produtos (
  nome,
  slug,
  descricao,
  preco,
  ativo,
  arquivo_path
)
SELECT
  'TESTE Checkout',
  'teste-checkout',
  'Produto de teste para validar Pix e download. Não divulgar.',
  0.05,
  true,
  'teste-checkout.pdf'
WHERE NOT EXISTS (
  SELECT 1 FROM public.produtos WHERE slug = 'teste-checkout'
);

-- Se já existir, só garante preço/arquivo/ativo de teste
UPDATE public.produtos
SET
  nome = 'TESTE Checkout',
  descricao = 'Produto de teste para validar Pix e download. Não divulgar.',
  preco = 0.05,
  ativo = true,
  arquivo_path = 'teste-checkout.pdf',
  updated_at = now()
WHERE slug = 'teste-checkout';

-- 2) Resultado final
SELECT id, nome, slug, preco, ativo, arquivo_path
FROM public.produtos
ORDER BY id;

-- ============================================
-- Link de teste (troque ID pelo id retornado):
-- https://leocercilier.github.io/checkout/checkout.html?produto=<ID>
--
-- Depois do teste, desative:
-- UPDATE public.produtos
-- SET ativo = false, updated_at = now()
-- WHERE slug = 'teste-checkout';
-- ============================================
