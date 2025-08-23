const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const QRCode = require('qrcode');

// Inicializar o Resend com verificação
let resend;
try {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY não está definida');
  }
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log('Resend inicializado com sucesso');
} catch (err) {
  console.error('Erro ao inicializar Resend:', err.message);
}

// Função para gerar payload PIX
function generatePixPayload(pixKey, amount, recipient = "Anna Frota", city = "Sao Paulo") {
  const amountFormatted = amount.toFixed(2);
  const transactionId = Math.random().toString(36).substring(2, 15);
  
  // Formato básico do payload PIX (versão simplificada)
  const payload = [
    "000201", // Início do payload
    "26580014br.gov.bcb.pix", // GUI do PIX
    "01" + pixKey.length.toString().padStart(2, '0') + pixKey, // Chave PIX
    "52040000", // Categoria comercial
    "5303986", // Moeda (986 = BRL)
    "54" + amountFormatted.length.toString().padStart(2, '0') + amountFormatted, // Valor
    "5802BR", // País
    "59" + recipient.length.toString().padStart(2, '0') + recipient, // Nome do beneficiário
    "60" + city.length.toString().padStart(2, '0') + city, // Cidade
    "62070503***", // Additional data field
    "6304" // CRC16
  ].join('');
  
  return payload;
}

exports.handler = async (event, context) => {
  console.log('Função save-submission iniciada');

  // Verificar se o Resend foi inicializado corretamente
  if (!resend) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Configuração de e-mail não inicializada' })
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ error: 'Método não permitido' })
    };
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Variáveis de ambiente faltando');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Configuração do servidor incompleta' })
      };
    }

    const payload = JSON.parse(event.body || '{}');

    // Honeypot anti-bot
    if (payload.company) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ success: true, message: 'OK' })
      };
    }

    const type = (payload.type || '').toLowerCase();
    if (!['purchase', 'download'].includes(type)) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Tipo inválido' }) };
    }

    // Normalização de campos
    let name = payload.name || payload['d-name'];
    let email = payload.email || payload['d-email'];
    if (!name || !email) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Nome e e-mail são obrigatórios' }) };
    }

    const phone = payload.phone || null;

    let quantity = null;
    let address = null;
    let delivery_notes = null;

    if (type === 'purchase') {
      quantity = Number(payload.quantity || 1);
      const required = ['postal_code', 'address_line1', 'district', 'city', 'state', 'country'];
      for (const f of required) {
        if (!payload[f] || String(payload[f]).trim() === '') {
          return { statusCode: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: `Campo obrigatório faltando: ${f}` }) };
        }
      }
      address = {
        postal_code: payload.postal_code,
        address_line1: payload.address_line1,
        address_line2: payload.address_line2 || null,
        district: payload.district,
        city: payload.city,
        state: payload.state,
        country: payload.country
      };
      delivery_notes = payload.delivery_notes || null;
    }

    let contribution = null;
    let payment_method = null;
    if (type === 'download') {
      contribution = payload['d-contrib'] ? Number(payload['d-contrib']) : (payload.contribution ? Number(payload.contribution) : null);
      payment_method = payload['d-payment_method'] || payload.payment_method || null;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const submissionData = {
      type,
      name,
      email,
      phone,
      quantity,
      contribution,
      payment_method,
      postal_code: address?.postal_code || null,
      address_line1: address?.address_line1 || null,
      address_line2: address?.address_line2 || null,
      district: address?.district || null,
      city: address?.city || null,
      state: address?.state || null,
      country: address?.country || null,
      delivery_notes,
      pix_key_shown: type === 'download',
      created_at: new Date().toISOString(),
      email_status: 'pending'
    };

    const { data: result, error: insertError } = await supabase
      .from('submissions')
      .insert([submissionData])
      .select();

    if (insertError) {
      console.error('Erro Supabase:', insertError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Erro ao salvar dados' })
      };
    }

    // Enviar e-mail via Resend
    let emailSent = false;
    let emailError = null;
    
    try {
      console.log('Tentando enviar e-mail para:', email);
      console.log('Usando from email:', process.env.RESEND_FROM_EMAIL);
      
      let emailSubject, emailHtml, textVersion;

      if (type === 'purchase') {
        const totalAmount = quantity * 54;
        
        // Gerar QR Code PIX em base64
        let qrCodeImage = '';
        try {
          const pixPayload = generatePixPayload('28421905805', totalAmount);
          qrCodeImage = await QRCode.toDataURL(pixPayload, {
            width: 256,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          });
        } catch (qrError) {
          console.error('Erro ao gerar QR Code:', qrError);
        }

        emailSubject = 'Confirmação de Compra - Treuss';
        
        // HTML version (otimizada para mobile)
        emailHtml = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>Confirmação de Compra - Treuss</title>
  <style>
    @media only screen and (max-width: 620px) {
      table.body table.container {
        width: 95% !important;
        max-width: 95% !important;
      }
      
      .header-img {
        width: 100% !important;
        height: auto !important;
      }
      
      .button {
        width: 100% !important;
      }
      
      .two-columns {
        display: block !important;
        width: 100% !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f9f9f9; color: #333; line-height: 1.6;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="container" style="background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0a0a0a; color: #ffd700; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">Treuss - A Energia Precede a Matéria</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <h2 style="color: #333; margin-top: 0;">Olá, ${name}!</h2>
              <p style="color: #555;">Obrigado por sua compra do livro <strong>Treuss - A Energia Precede a Matéria</strong>.</p>
              
              <!-- QR Code Section -->
              <div style="text-align: center; margin: 30px 0;">
                <h3 style="color: #333;">Pagamento via PIX</h3>
                <img src="${qrCodeImage}" alt="QR Code PIX para pagamento" width="256" style="border: 1px solid #ddd; border-radius: 8px; max-width: 100%; height: auto;">
                <p style="color: #777; font-size: 14px;">Escaneie este QR Code com seu aplicativo bancário</p>
              </div>
              
              <!-- Fallback Information -->
              <div style="background-color: #f5f5f5; border-radius: 5px; padding: 15px; margin: 20px 0;">
                <h4 style="color: #333; margin-top: 0;">Caso não consiga escanear o QR Code:</h4>
                <p style="margin: 10px 0;"><strong>Chave PIX:</strong></p>
                <p style="background-color: #eee; padding: 10px; border-radius: 5px; word-break: break-all; font-family: monospace;">28421905805</p>
                <p style="margin: 10px 0;"><strong>Valor:</strong> R$ ${totalAmount.toFixed(2)}</p>
                <p style="margin: 10px 0;"><strong>Beneficiário:</strong> Anna Frota</p>
              </div>
              
              <!-- Order Summary -->
              <div style="background-color: #fff8e1; border-left: 4px solid #ffd700; padding: 15px; margin: 20px 0;">
                <h4 style="color: #333; margin-top: 0;">Resumo do pedido:</h4>
                <p style="margin: 5px 0;"><strong>Quantidade:</strong> ${quantity} exemplar(es)</p>
                <p style="margin: 5px 0;"><strong>Valor total:</strong> R$ ${totalAmount.toFixed(2)}</p>
              </div>
              
              <p style="color: #555;">Após a confirmação do pagamento, seu pedido será enviado em até 2 dias úteis.</p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #0a0a0a; color: #fff; padding: 15px; text-align: center; font-size: 12px;">
              <p style="margin: 0;">Equipe Treuss | <a href="https://treuss.com" style="color: #ffd700; text-decoration: none;">treuss.com</a></p>
              <p style="margin: 10px 0 0; font-size: 11px; color: #ccc;">Caso tenha problemas com o QR Code, você pode copiar a chave PIX acima e colar manualmente em seu aplicativo bancário.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
        
        // Text version for fallback
        textVersion = `Confirmação de Compra - Treuss

Olá ${name},

Obrigado por sua compra do livro "Treuss - A Energia Precede a Matéria".

Para realizar o pagamento via PIX:

Chave PIX: 28421905805
Valor: R$ ${totalAmount.toFixed(2)}
Beneficiário: Anna Frota

Resumo do pedido:
- Quantidade: ${quantity} exemplar(es)
- Valor total: R$ ${totalAmount.toFixed(2)}

Após a confirmação do pagamento, seu pedido será enviado em até 2 dias úteis.

Equipe Treuss
https://treuss.com

Caso tenha problemas com o QR Code, você pode copiar a chave PIX acima e colar manualmente em seu aplicativo bancário.`;

      } else if (type === 'download') {
        emailSubject = 'Download do eBook - Treuss';
        
        // HTML version
        emailHtml = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>Download do eBook - Treuss</title>
  <style>
    @media only screen and (max-width: 620px) {
      table.body table.container {
        width: 95% !important;
        max-width: 95% !important;
      }
      
      .button {
        width: 100% !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f9f9f9; color: #333; line-height: 1.6;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="container" style="background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0a0a0a; color: #ffd700; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">Treuss - A Energia Precede a Matéria</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <h2 style="color: #333; margin-top: 0;">Olá, ${name}!</h2>
              <p style="color: #555;">Obrigado por baixar o eBook <strong>Treuss - A Energia Precede a Matéria</strong>.</p>
              <p style="color: #555;">Clique no link abaixo para fazer o download:</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://drive.google.com/your-download-link" style="background-color: #ffd700; color: #000; padding: 15px 30px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">Fazer Download do eBook</a>
              </div>
              
              <div style="background-color: #f5f5f5; border-radius: 5px; padding: 15px; margin: 20px 0;">
                <h4 style="color: #333; margin-top: 0;">Chave PIX para contribuição:</h4>
                <p style="background-color: #eee; padding: 10px; border-radius: 5px; word-break: break-all; font-family: monospace;">28421905805</p>
                <p style="color: #555;">Sua contribuição ajuda a manter este projeto vivo!</p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #0a0a0a; color: #fff; padding: 15px; text-align: center; font-size: 12px;">
              <p style="margin: 0;">Equipe Treuss | <a href="https://treuss.com" style="color: #ffd700; text-decoration: none;">treuss.com</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
        
        // Text version for fallback
        textVersion = `Download do eBook - Treuss

Olá ${name},

Obrigado por baixar o eBook "Treuss - A Energia Precede a Matéria".

Para fazer o download, acesse:
https://drive.google.com/your-download-link

Chave PIX para contribuição: 28421905805

Sua contribuição ajuda a manter este projeto vivo!

Equipe Treuss
https://treuss.com`;
      }

      const { data, error } = await resend.emails.send({
        from: 'Equipe Livro Treuss <' + process.env.RESEND_FROM_EMAIL + '>',
        to: email,
        subject: emailSubject,
        html: emailHtml,
        text: textVersion,
      });

      if (error) {
        console.error('Erro específico do Resend:', JSON.stringify(error, null, 2));
        throw new Error(error.message);
      }

      emailSent = true;
      console.log('E-mail enviado com sucesso:', data);

      // Atualizar o status do e-mail no Supabase para 'sent'
      await supabase
        .from('submissions')
        .update({ email_status: 'sent' })
        .eq('id', result[0].id);

    } catch (err) {
      emailError = err.message;
      console.error('Erro completo ao enviar e-mail:', err);
      console.error('Stack trace:', err.stack);

      // Atualizar o status do e-mail no Supabase para 'failed'
      await supabase
        .from('submissions')
        .update({ email_status: 'failed', email_error: err.message })
        .eq('id', result[0].id);
    }

    const message = type === 'purchase'
      ? 'Pedido registrado. Você receberá por e-mail o Comprovante de Pedido com os dados completos.'
      : 'Registro efetuado. O link do eBook será enviado por e-mail.';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        success: true, 
        message, 
        id: result?.[0]?.id || null,
        emailSent,
        emailError
      })
    };

  } catch (err) {
    console.error('Erro inesperado:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Erro interno do servidor' })
    };
  }
};
