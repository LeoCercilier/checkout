require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
const mpConfigured = !!token;

app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    mercado_pago_configurado: mpConfigured,
    ambiente: 'backend'
  });
});

app.post('/api/pagamento/pix', async (req, res) => {
  try {
    if (!mpConfigured) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Mercado Pago não configurado.'
      });
    }

    const {
      valor,
      descricao,
      email,
      modo_teste
    } = req.body;

    if (modo_teste !== true) {
      return res.status(400).json({
        sucesso: false,
        erro: 'O endpoint está protegido. Envie modo_teste: true durante os testes.'
      });
    }

    if (!valor || !email) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Valor e email são obrigatórios.'
      });
    }

    const valorNumerico = Number(valor);

    if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Valor inválido.'
      });
    }

    const valorFormatado = valorNumerico.toFixed(2);

    const response = await fetch(
      'https://api.mercadopago.com/v1/orders',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': crypto.randomUUID()
        },
        body: JSON.stringify({
          type: 'online',
          total_amount: valorFormatado,
          external_reference: `pedido-${Date.now()}`,
          processing_mode: 'automatic',

          transactions: {
            payments: [
              {
                amount: valorFormatado,
                payment_method: {
                  id: 'pix',
                  type: 'bank_transfer'
                }
              }
            ]
          },

          payer: {
            email: String(email)
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Erro Mercado Pago:', data);

      return res.status(response.status).json({
        sucesso: false,
        erro: 'Mercado Pago recusou o pedido.',
        detalhe: data?.message || data?.error || 'Erro desconhecido.'
      });
    }

    const pagamento = data?.transactions?.payments?.[0];
    const metodo = pagamento?.payment_method;

    console.log('Pedido Pix criado:', data.id);
    console.log('Pagamento:', pagamento?.id);
    console.log('Status:', pagamento?.status);

    return res.json({
      sucesso: true,

      pedido_id: data.id || null,
      pagamento_id: pagamento?.id || null,

      status: pagamento?.status || null,
      status_detalhe: pagamento?.status_detail || null,

      qr_code: metodo?.qr_code || null,
      qr_code_base64: metodo?.qr_code_base64 || null,
      ticket_url: metodo?.ticket_url || null
    });

  } catch (error) {
    console.error('Erro interno:', error);

    return res.status(500).json({
      sucesso: false,
      erro: 'Erro interno ao criar pagamento Pix.',
      detalhe: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
