// Atualize o save-submission.js com melhor tratamento de erro
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  console.log('Função save-submission iniciada');
  
  // Verificar método HTTP
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
    // Verificar variáveis de ambiente
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    
    console.log('Variáveis de ambiente verificadas');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Variáveis de ambiente faltando');
      return {
        statusCode: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Configuração do servidor incompleta' })
      };
    }

    // Parse dos dados
    const data = JSON.parse(event.body);
    console.log('Dados recebidos:', JSON.stringify(data));
    
    // Validação
    if (!data.type || !data.email || !data.name) {
      return {
        statusCode: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Campos obrigatórios faltando' })
      };
    }

    // Conectar ao Supabase
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Preparar dados
    const submissionData = {
      type: data.type,
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      quantity: data.quantity ? parseInt(data.quantity) : null,
      contribution: data.contribution ? parseFloat(data.contribution) : null,
      created_at: new Date().toISOString()
    };

    // Inserir no banco
    const { data: result, error } = await supabase
      .from('submissions')
      .insert([submissionData]);

    if (error) {
      console.error('Erro Supabase:', error);
      return {
        statusCode: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Erro ao salvar dados' })
      };
    }

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: true, 
        message: 'Dados salvos com sucesso' 
      })
    };
  } catch (error) {
    console.error('Erro inesperado:', error);
    return {
      statusCode: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Erro interno do servidor' })
    };
  }
};
