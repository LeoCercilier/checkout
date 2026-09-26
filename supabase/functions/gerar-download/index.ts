// Edge Function: gerar-download
// Gera Signed URL temporária para download do e-book após validar pedido + pagamento + produto.
// Usa service role. Nunca expõe secrets no frontend.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ sucesso: false, erro: "Método não permitido." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const external_reference = body?.external_reference;

    if (!external_reference || typeof external_reference !== "string") {
      return new Response(
        JSON.stringify({ sucesso: false, erro: "external_reference é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Service role (só disponível no backend da Edge Function)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Busca o pedido pelo external_reference
    const { data: pedido, error: pedidoError } = await supabase
      .from("pedidos")
      .select("id, produto_id, status, email, external_reference")
      .eq("external_reference", external_reference)
      .maybeSingle();

    if (pedidoError) {
      console.error("Erro ao buscar pedido:", pedidoError);
      return new Response(
        JSON.stringify({ sucesso: false, erro: "Erro ao localizar o pedido." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!pedido) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: "Pedido não encontrado." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Valida status do pagamento (mesmo critério da consultar-pedido)
    const statusConfirmados = ["processed", "approved"];
    if (!statusConfirmados.includes(pedido.status)) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          erro: "Pagamento ainda não confirmado.",
          status_atual: pedido.status,
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Busca o produto e o arquivo_path
    const { data: produto, error: produtoError } = await supabase
      .from("produtos")
      .select("id, nome, arquivo_path, ativo")
      .eq("id", pedido.produto_id)
      .maybeSingle();

    if (produtoError || !produto) {
      console.error("Erro ao buscar produto:", produtoError);
      return new Response(
        JSON.stringify({ sucesso: false, erro: "Produto não encontrado." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!produto.ativo) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: "Produto não está ativo." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!produto.arquivo_path || produto.arquivo_path.trim() === "") {
      return new Response(
        JSON.stringify({
          sucesso: false,
          erro: "Arquivo do produto ainda não configurado.",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const arquivoPath = produto.arquivo_path.trim();

    // 4. Gera Signed URL (expira em 1 hora)
    const expiresIn = 3600; // segundos

    const { data: signedData, error: signedError } = await supabase.storage
      .from("ebooks")
      .createSignedUrl(arquivoPath, expiresIn);

    if (signedError || !signedData?.signedUrl) {
      console.error("Erro ao gerar Signed URL:", signedError);
      return new Response(
        JSON.stringify({
          sucesso: false,
          erro: "Não foi possível gerar o link de download.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Registra o download (somente após todas as validações + Signed URL gerada)
    const { error: downloadError } = await supabase.from("downloads").insert({
      pedido_id: pedido.id,
      produto_id: produto.id,
      external_reference: pedido.external_reference,
      arquivo_path: arquivoPath,
    });

    if (downloadError) {
      // Não bloqueia o download se o log falhar, apenas registra no log
      console.error("Erro ao registrar download (não crítico):", downloadError);
    }

    // 6. Retorna sucesso
    return new Response(
      JSON.stringify({
        sucesso: true,
        url: signedData.signedUrl,
        expires_in: expiresIn,
        produto_nome: produto.nome,
        arquivo: arquivoPath,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Erro interno gerar-download:", err);
    return new Response(
      JSON.stringify({
        sucesso: false,
        erro: "Erro interno ao processar o download.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
