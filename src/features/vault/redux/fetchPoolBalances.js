import { useCallback } from 'react';
import { vaultABI, erc20ABI } from '../../configure';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { VAULT_FETCH_POOL_BALANCES_BEGIN, VAULT_FETCH_POOL_BALANCES_SUCCESS, VAULT_FETCH_POOL_BALANCES_FAILURE } from './constants';
import { fetchPricePerFullShare, fetchAllowance, fetchTvl, fetchPrice } from '../../web3';
import async from 'async';

// FIXME: this function now getches all the information related to the pool, not only balances

export function fetchPoolBalances(data) {
  return dispatch => {
    // optionally you can have getState as the second argument
    dispatch({
      type: VAULT_FETCH_POOL_BALANCES_BEGIN,
    });

    // Return a promise so that you could control UI flow without states in the store.
    // For example: after submit a form, you need to redirect the page to another when succeeds or show some errors message if fails.
    // It's hard to use state to manage it, but returning a promise allows you to easily achieve it.
    // e.g.: handleSubmit() { this.props.actions.submitForm(data).then(()=> {}).catch(() => {}); }
    const promise = new Promise((resolve, reject) => {
      // doRequest is a placeholder Promise. You should replace it with your own logic.
      // args.error here is only for test coverage purpose.
      const { address, web3, pools } = data;
      async.map(
        pools,
        (pool, callback) => {
          const earnContract = new web3.eth.Contract(vaultABI, pool.earnContractAddress);
          const erc20Contract = pool.tokenAddress ? new web3.eth.Contract(erc20ABI, pool.tokenAddress) : null;
          async.parallel(
            [
              callbackInner => {
                fetchAllowance({
                  web3,
                  contractAddress: pool.earnContractAddress,
                  contract: erc20Contract,
                  address,
                })
                  .then(data => {
                    return callbackInner(null, data);
                  })
                  .catch(error => {
                    return callbackInner(error, 0);
                  });
              },
              callbackInner => {
                fetchPricePerFullShare({
                  contract: earnContract,
                  address,
                })
                  .then(data => {
                    return callbackInner(null, data);
                  })
                  .catch(error => {
                    return callbackInner(error, 0);
                  });
              },
              callbackInner => {
                fetchTvl({
                  contract: earnContract,
                })
                  .then(data => {
                    return callbackInner(null, data);
                  })
                  .catch(error => {
                    return callbackInner(error, 0);
                  });
              },
              callbackInner => {
                fetchPrice({
                  id: pool.oracleId,
                })
                  .then(data => {
                    return callbackInner(null, data);
                  })
                  .catch(error => {
                    return callbackInner(error, 0);
                  });
              },
            ],
            (error, data) => {
              if (error) {
                console.log(error);
              }
              pool.allowance = data[0] || 0;
              pool.pricePerFullShare = data[1] || 1;
              pool.tvl = data[2] || 0;
              pool.oraclePrice = data[3] || 0;
              callback(null, pool);
            }
          );
        },
        (error, pools) => {
          if (error) {
            dispatch({
              type: VAULT_FETCH_POOL_BALANCES_FAILURE,
            });
            return reject(error.message || error);
          }
          dispatch({
            type: VAULT_FETCH_POOL_BALANCES_SUCCESS,
            data: pools,
          });
          resolve();
        }
      );
    });

    return promise;
  };
}

export function useFetchPoolBalances() {
  // args: false value or array
  // if array, means args passed to the action creator
  const dispatch = useDispatch();

  const { pools, fetchPoolBalancesPending } = useSelector(
    state => ({
      pools: state.vault.pools,
      fetchPoolBalancesPending: state.vault.fetchPoolBalancesPending,
    }),
    shallowEqual
  );

  const boundAction = useCallback(
    data => {
      return dispatch(fetchPoolBalances(data));
    },
    [dispatch]
  );

  return {
    pools,
    fetchPoolBalances: boundAction,
    fetchPoolBalancesPending,
  };
}

export function reducer(state, action) {
  switch (action.type) {
    case VAULT_FETCH_POOL_BALANCES_BEGIN:
      // Just after a request is sent
      return {
        ...state,
        fetchPoolBalancesPending: true,
      };

    case VAULT_FETCH_POOL_BALANCES_SUCCESS:
      // The request is success
      return {
        ...state,
        pools: action.data,
        fetchPoolBalancesPending: false,
      };

    case VAULT_FETCH_POOL_BALANCES_FAILURE:
      // The request is failed
      return {
        ...state,
        fetchPoolBalancesPending: false,
      };

    default:
      return state;
  }
}
