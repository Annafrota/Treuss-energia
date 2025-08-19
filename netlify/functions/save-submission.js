const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const data = JSON.parse(event.body);
  
  const { error } = await supabase
    .from('submissions')
    .insert([{
      type: data.type,
      name: data.name,
      email: data.email,
      phone: data.phone,
      quantity: data.quantity,
      contribution: data.contribution
    }]);

  if (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Dados salvos com sucesso!" })
  };
};

