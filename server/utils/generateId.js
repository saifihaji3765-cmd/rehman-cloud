function generateId(
  prefix = "vc"
){

  const random =

    Math.random()
    .toString(36)
    .substring(2,10);

  const timestamp =

    Date.now();

  return `${prefix}-${timestamp}-${random}`;

}

module.exports =
generateId;
