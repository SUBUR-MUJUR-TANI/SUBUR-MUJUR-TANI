exports.handler = async (event) => {

    try {

        const keyword = event.queryStringParameters.search;

        if (!keyword) {

            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    message: "Parameter search wajib diisi."
                })
            };

        }

        const response = await fetch(
            `https://api.binderbyte.com/v1/search?api_key=${process.env.BINDERBYTE_API_KEY}&keyword=${encodeURIComponent(keyword)}`
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