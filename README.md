# Near DevHub indexers

This repo keeps track of DevHub's indexers. 
DevHub makes use of two custom indexers

1. The proposal [indexer](https://near.org/dataplatform.near/widget/QueryApi.App?selectedIndexerPath=thomasguntenaar.near/devhub_proposals_sierra)
2. The post [indexer](https://near.org/dataplatform.near/widget/QueryApi.App?selectedIndexerPath=bo.near/devhub_v38) (old feed)


## View

QueryAPI has a `QueryApi.App` [NEAR widget](https://near.org/dataplatform.near/widget/QueryApi.App), hosted under the dataplatform.near account. With this component, you can see all the public indexers currently available on the Near blockchain.


## Deploy

> [!IMPORTANT] 
> In order to deploy indexers your account needs to be given permission.

Simply fork an existing indexer and press the publish button in the [QueryApi.App](https://near.org/dataplatform.near/widget/QueryApi.App) widget.
![alt text](./dataplatformQueryApi.App.png)


Tips:
1. Once a indexer is deployed the schema can't be edited only forked. Make sure to deleted unused once.
2. Make sure to fork the indexer before editing it. It automatically changes the name for you.


Read more about the indexer in the [docs](https://docs.near.org/concepts/advanced/indexers)

Read more about [query api](https://docs.near.org/bos/queryapi/intro)
