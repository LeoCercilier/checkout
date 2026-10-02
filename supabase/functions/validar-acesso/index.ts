// Edge Function: validar-acesso
// Valida token do e-mail e retorna cursos com pagamento confirmado.
// O download continua exclusivo via gerar-download + external_reference.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ sucesso: false, erro: "Metodo nao permitido." }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();

    if (!token || token.length < 32) {
      return json({ sucesso: false, erro: "Token invalido." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row, error } = await supabase
      .from("acesso_tokens")
      .select("id, email, token, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      console.error(error);
      return json({ sucesso: false, erro: "Falha ao validar acesso." }, 500);
    }

    if (!row) {
      return json({ sucesso: false, erro: "Link invalido ou expirado." }, 404);
    }

    if (row.used_at) {
      return json(
        {
          sucesso: false,
          erro: "Este link ja foi utilizado. Solicite um novo acesso.",
        },
        403,
      );
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      return json(
        { sucesso: false, erro: "Este link expirou. Solicite um novo acesso." },
        403,
      );
    }

    // Marca como usado (1 uso)
    await supabase
      .from("acesso_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", row.id);

    const email = String(row.email).toLowerCase();

    const { data: pedidos, error: pedErr } = await supabase
      .from("pedidos")
      .select("id, produto_id, status, external_reference, email, created_at")
      .ilike("email", email)
      .in("status", ["processed", "approved"])
      .order("created_at", { ascending: false });

    if (pedErr) {
      console.error(pedErr);
      return json({ sucesso: false, erro: "Falha ao buscar cursos." }, 500);
    }

    if (!pedidos || pedidos.length === 0) {
      return json({
        sucesso: true,
        email,
        cursos: [],
        mensagem: "Nenhum curso liberado encontrado para este e-mail.",
      });
    }

    const produtoIds = [...new Set(pedidos.map((p) => p.produto_id).filter(Boolean))];

    const { data: produtos, error: prodErr } = await supabase
      .from("produtos")
      .select("id, nome, arquivo_path, ativo")
      .in("id", produtoIds);

    if (prodErr) {
      console.error(prodErr);
      return json({ sucesso: false, erro: "Falha ao carregar produtos." }, 500);
    }

    const mapa = new Map((produtos || []).map((p) => [p.id, p]));

    // Um curso por produto (mais recente)
    const vistos = new Set<number>();
    const cursos: Array<Record<string, unknown>> = [];

    for (const ped of pedidos) {
      const pid = Number(ped.produto_id);
      if (!pid || vistos.has(pid)) continue;
      vistos.add(pid);

      const prod = mapa.get(pid);
      if (!prod || !prod.ativo) continue;
      if (!prod.arquivo_path) continue;

      cursos.push({
        produto_id: pid,
        nome: prod.nome,
        external_reference: ped.external_reference,
        pedido_id: ped.id,
      });
    }

    return json({
      sucesso: true,
      email,
      cursos,
    });
  } catch (e) {
    console.error(e);
    return json({ sucesso: false, erro: "Erro interno." }, 500);
  }
});
