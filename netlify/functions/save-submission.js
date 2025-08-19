// netlify/functions/save-submission.js
const { createClient } = require('@supabase/supabase-js');

// Log para debug - verificar se a função está carregando
console.log('Função save-submission carregada');

exports.handler = async (event, context) => {
  console.log('Função iniciada - Method:', event.httpMethod);
  
  // Verificar método HTTP
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Método não permitido' })
    };
  }

  try {
    // Verificar variáveis de ambiente com mais detalhes
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    
    console.log('Variáveis de ambiente:');
    console.log('SUPABASE_URL existe:', !!supabaseUrl);
    console.log('SUPABASE_SERVICE_KEY existe:', !!supabaseKey);
    
    if (!supabaseUrl || !supabaseKey) {
      const errorMsg = 'Variáveis de ambiente não configuradas corretamente. ';
      if (!supabaseUrl) errorMsg += 'SUPABASE_URL faltando. ';
      if (!supabaseKey) errorMsg += 'SUPABASE_SERVICE_KEY faltando.';
      
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: errorMsg })
      };
    }

    // Parse dos dados recebidos
    let data;
    try {
      data = JSON.parse(event.body);
      console.log('Dados recebidos:', JSON.stringify(data));
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'JSON inválido no corpo da requisição' })
      };
    }
    
    // Validar dados obrigatórios
    if (!data.type || !data.email || !data.name) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Campos obrigatórios faltando: type, email, name' })
      };
    }

    // Criar cliente Supabase
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('Cliente Supabase criado com sucesso');

    // Preparar dados para inserção
    const submissionData = {
      type: data.type,
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      quantity: data.quantity ? parseInt(data.quantity) : null,
      contribution: data.contribution ? parseFloat(data.contribution) : null,
      created_at: new Date().toISOString()
    };

    console.log('Dados para inserção:', submissionData);

    // Inserir no Supabase
    const { data: result, error } = await supabase
      .from('submissions')
      .insert([submissionData]);

    if (error) {
      console.error('Erro do Supabase:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Erro ao salvar dados no banco',
          details: error.message 
        })
      };
    }

    console.log('Dados inseridos com sucesso:', result);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: true, 
        message: 'Dados salvos com sucesso',
        data: result
      })
    };
  } catch (error) {
    console.error('Erro inesperado:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Erro interno do servidor',
        details: error.message 
      })
    };
  }
};
