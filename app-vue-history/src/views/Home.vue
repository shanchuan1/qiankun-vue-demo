<template>
  <div class="home">
    <img alt="Vue logo" src="../assets/logo.png">
    <HelloWorld ref="helloWorld" msg="Welcome to Your Vue.js App"/>
    <button @click="handleClick">点击手动卸载helloWorld组件</button>
  </div>
</template>

<script>
// @ is an alias to /src
import HelloWorld from '@/components/HelloWorld.vue'

export default {
  name: 'Home',
  components: {
    HelloWorld
  },
  methods:{
    handleClick(){
      console.log('手动卸载helloWorld组件')
      // 通过 $refs 获取组件实例，并调用 $destroy() 方法销毁组件, 调用只会销毁组件实例，但不会从 DOM 结构中移除组件的元素。
      this.$refs.helloWorld.$destroy();

      // 从 DOM 结构中移除组件的元素
      this.$refs.helloWorld.removeSelf()
    }
  }
}
</script>
