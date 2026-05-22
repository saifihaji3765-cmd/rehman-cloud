function formatResponse({

  success = true,

  message = "",

  data = null,

  error = null

}){

  return {

    success,

    message,

    data,

    error,

    timestamp:
    new Date()

  };

}

module.exports =
formatResponse;
