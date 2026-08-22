exports.handler = async (event) => {

    try {

        const id = event.queryStringParameters.id;

        if (!id) {

            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    message: "ID Provinsi wajib diisi."
                })
            };

        }

        const response = await fetch(
            `https://api.binderbyte.com/v1/listkabupaten?api_key=${process.env.BINDERBYTE_API_KEY}&id_provinsi=${id}`
        );

        const result = await response.json();

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(result)
        };

    } catch (err) {

        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                message: err.message
            })
        };

    }

};