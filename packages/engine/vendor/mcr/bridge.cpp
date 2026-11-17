/* OpenMahjong MIT bridge to Jeff Wang's MIT mahjong-algorithm.
 * Input: [counts34, meldCount, winningType, flags, flowers, seat0..3,
 * round0..3, {kind(1 chow/2 pung/3 kong), middle/type, concealed} * 4].
 * Counts include the winning tile and every physical tile in fixed sets.
 * Bounded/structural validation belongs to the TypeScript boundary.
 */
#include "fan_calculator.h"
#include "shanten.h"
#include <algorithm>
#include <cstring>
using namespace mahjong;
static int input[64],output[96];
static tile_t tile(int t){if(t<9)return 0x11+t;if(t<18)return 0x31+t-9;if(t<27)return 0x21+t-18;if(t<31)return 0x41+t-27;return 0x47-(t-31);}
extern "C" {
int* mcr_input(){return input;}
int* mcr_output(){return output;}
int mcr_size(){return FAN_TABLE_SIZE;}
const char* mcr_name(int i){return fan_name[i];}
int mcr_value(int i){return fan_value_table[i];}
int mcr_score(){
 calculate_param_t p{};fan_table_t f{};int counts[34];std::memcpy(counts,input,34*sizeof(int));
 p.hand_tiles.pack_count=input[34];p.win_tile=tile(input[35]);p.win_flag=input[36];p.flower_count=input[37];p.seat_wind=static_cast<wind_t>(input[38]);p.prevalent_wind=static_cast<wind_t>(input[39]);
 for(int i=0;i<input[34];i++){int k=input[40+3*i],t=input[41+3*i],closed=input[42+3*i];p.hand_tiles.fixed_packs[i]=make_pack(closed?0:1,k,tile(t));if(k==PACK_TYPE_CHOW){counts[t-1]--;counts[t]--;counts[t+1]--;}else counts[t]-=k==PACK_TYPE_KONG?4:3;}
 counts[input[35]]--;for(int t=0;t<34;t++)for(int c=0;c<counts[t];c++)p.hand_tiles.standing_tiles[p.hand_tiles.tile_count++]=tile(t);
 const int result=calculate_fan(&p,&f);for(int i=0;i<FAN_TABLE_SIZE;i++)output[i]=f[i];return result;
}
static int distance13(const tile_t* tiles,int n){
 int d=regular_shanten(tiles,n,nullptr);
 if(n==13){d=std::min(d,seven_pairs_shanten(tiles,n,nullptr));d=std::min(d,thirteen_orphans_shanten(tiles,n,nullptr));d=std::min(d,honors_and_knitted_tiles_shanten(tiles,n,nullptr));}
 if(n>=10)d=std::min(d,knitted_straight_shanten(tiles,n,nullptr));return d;
}
int mcr_distance(){
 tile_t tiles[14];int n=0;for(int t=0;t<34;t++)for(int c=0;c<input[t];c++)tiles[n++]=tile(t);
 if(n%3==1)return distance13(tiles,n);
 tile_t test=tiles[--n];if(is_regular_win(tiles,n,test)||(n==13&&(is_seven_pairs_win(tiles,n,test)||is_thirteen_orphans_win(tiles,n,test)||is_honors_and_knitted_tiles_win(tiles,n,test)))||(n>=10&&is_knitted_straight_win(tiles,n,test)))return -1;
 int d=distance13(tiles,n);for(int i=0;i<n;i++){tile_t old=tiles[i];tiles[i]=test;d=std::min(d,distance13(tiles,n));tiles[i]=old;}return d;
}
}
