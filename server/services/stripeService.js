const Stripe =
require("stripe");

/* =========================
   STRIPE INSTANCE
========================= */

const stripe =

new Stripe(

  process.env.STRIPE_SECRET_KEY

);

/* =========================
   CREATE CHECKOUT SESSION
========================= */

async function createCheckoutSession({

  planName,

  amount,

  customerEmail

}){

  try{

    const session =

      await stripe.checkout.sessions.create({

        payment_method_types:[

          "card"

        ],

        mode:"subscription",

        customer_email:
        customerEmail,

        line_items:[

          {

            price_data:{

              currency:"usd",

              product_data:{

                name:planName

              },

              unit_amount:
              amount * 100,

              recurring:{

                interval:"month"

              }

            },

            quantity:1

          }

        ],

        success_url:

`${process.env.CLIENT_URL}/success`,

        cancel_url:

`${process.env.CLIENT_URL}/cancel`

      });

    return {

      success:true,

      url:session.url

    };

  }

  catch(error){

    return {

      success:false,

      error:error.message

    };

  }

}

/* =========================
   EXPORT
========================= */

module.exports = {

  createCheckoutSession

};
